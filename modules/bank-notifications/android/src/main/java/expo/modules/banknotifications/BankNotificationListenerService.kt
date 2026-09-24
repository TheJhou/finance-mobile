package expo.modules.banknotifications

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class BankNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    Log.i(TAG, "Notification listener connected")
    isConnected = true
    connectionCallback?.invoke(true)

    // Replay only recent notifications (last 60s) to avoid flooding on reconnect
    try {
      val active = getActiveNotifications()
      val now = System.currentTimeMillis()
      val recent = active.filter { now - it.postTime < 60_000 }
      if (recent.isNotEmpty()) {
        Log.i(TAG, "Replaying ${recent.size} recent notifications on reconnect (total active: ${active.size})")
        for (sbn in recent) {
          onNotificationPosted(sbn)
        }
      }
    } catch (e: Throwable) {
      Log.w(TAG, "getActiveNotifications failed on connect", e)
    }
  }

  override fun onListenerDisconnected() {
    Log.w(TAG, "Notification listener disconnected — JS will handle rebind")
    isConnected = false
    connectionCallback?.invoke(false)
    // Rebind is handled by the JS side (use-notification-listener.ts) which
    // coordinates backoff and avoids duplicate simultaneous requestRebind calls.
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName !in BANK_PACKAGES) return
    val extras = sbn.notification.extras
    val title = extras.getCharSequence("android.title")?.toString() ?: ""
    val text = extras.getCharSequence("android.text")?.toString() ?: ""
    val bigText = extras.getCharSequence("android.bigText")?.toString()
    val subText = extras.getCharSequence("android.subText")?.toString()

    val payload: Map<String, Any?> = mapOf(
      "packageName" to sbn.packageName,
      "title" to title,
      "text" to text,
      "bigText" to bigText,
      "subText" to subText,
      "postTime" to sbn.postTime
    )

    val cb = listener
    if (cb != null) {
      try {
        cb.invoke(payload)
      } catch (e: Throwable) {
        Log.e(TAG, "Error dispatching notification to JS", e)
      }
    } else {
      // JS listener is null (app fechado ou sem observar) — persiste em disco para
      // sobreviver ao encerramento do processo pelo sistema
      bufferNotification(applicationContext, payload)
    }
  }

  companion object {
    private const val TAG = "BankNotifService"

    private val BANK_PACKAGES = setOf(
      "com.nu.production",
      "br.com.intermedium",
      "com.picpay",
      "com.ctsi.android.app.privatelabel.c6bank",
      "com.mercadopago.wallet",
      "com.itau",
      "com.itau.empresas",
      "com.bradesco",
      "com.santander.app",
      "br.com.bb.android",
      "br.com.gabba.Caixa",
      "br.com.xp.carteira",
      "com.btg.pactual.pdigital",
      "br.com.neon",
      "br.com.next",
      "br.com.willbank",
      "com.recargapay",
      "com.ame.digital",
      "br.com.pagseguro.app",
    )

    @Volatile
    var isConnected: Boolean = false

    @Volatile
    var listener: ((Map<String, Any?>) -> Unit)? = null

    @Volatile
    var connectionCallback: ((Boolean) -> Unit)? = null

    private const val MAX_BUFFER = 100
    private const val BUFFER_PREFS = "bank_notifications_buffer"
    private const val BUFFER_KEY = "pending"
    private val bufferLock = Any()

    /**
     * Guarda a notificação em SharedPreferences (privado do app) até o JS voltar a
     * observar. Antes ficava só em memória e se perdia quando o Android encerrava
     * o processo com o app fechado.
     */
    fun bufferNotification(context: Context, payload: Map<String, Any?>) {
      synchronized(bufferLock) {
        try {
          val prefs = context.getSharedPreferences(BUFFER_PREFS, Context.MODE_PRIVATE)
          val pending = JSONArray(prefs.getString(BUFFER_KEY, "[]"))
          if (pending.length() >= MAX_BUFFER) {
            Log.w(TAG, "Buffer full — dropping notification (pkg=${payload["packageName"]})")
            return
          }
          val item = JSONObject()
          for ((key, value) in payload) {
            item.put(key, value ?: JSONObject.NULL)
          }
          pending.put(item)
          prefs.edit().putString(BUFFER_KEY, pending.toString()).commit()
          Log.i(TAG, "Notification buffered (buffer=${pending.length()}, pkg=${payload["packageName"]})")
        } catch (e: Throwable) {
          Log.e(TAG, "Failed to buffer notification", e)
        }
      }
    }

    fun drainBufferedNotifications(context: Context): List<Map<String, Any?>> {
      synchronized(bufferLock) {
        val prefs = context.getSharedPreferences(BUFFER_PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(BUFFER_KEY, null) ?: return emptyList()
        prefs.edit().remove(BUFFER_KEY).commit()

        val drained = mutableListOf<Map<String, Any?>>()
        try {
          val pending = JSONArray(raw)
          for (i in 0 until pending.length()) {
            val item = pending.getJSONObject(i)
            drained.add(
              mapOf(
                "packageName" to item.optString("packageName"),
                "title" to item.optString("title"),
                "text" to item.optString("text"),
                "bigText" to if (item.isNull("bigText")) null else item.optString("bigText"),
                "subText" to if (item.isNull("subText")) null else item.optString("subText"),
                "postTime" to item.optLong("postTime")
              )
            )
          }
        } catch (e: Throwable) {
          Log.e(TAG, "Corrupted notification buffer — discarding", e)
        }
        if (drained.isNotEmpty()) {
          Log.i(TAG, "Drained ${drained.size} buffered notifications")
        }
        return drained
      }
    }

    fun requestRebind(context: Context) {
      try {
        val pm = context.packageManager
        val component = ComponentName(context, BankNotificationListenerService::class.java)
        val enabledState = pm.getComponentEnabledSetting(component)
        Log.i(TAG, "requestRebind: component enabled state = $enabledState")
        if (enabledState != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
          // Component was disabled by system — re-enable it, then request rebind
          Log.w(TAG, "requestRebind: component was disabled — re-enabling")
          pm.setComponentEnabledSetting(
            component,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
          )
          Handler(Looper.getMainLooper()).postDelayed({
            try {
              NotificationListenerService.requestRebind(component)
              Log.i(TAG, "requestRebind: called after component re-enable")
            } catch (e: Throwable) {
              Log.e(TAG, "requestRebind: failed after re-enable", e)
            }
          }, 500)
        } else {
          // Component is enabled but service was killed — toggle to force rebind
          Log.i(TAG, "requestRebind: toggling component to force rebind")
          pm.setComponentEnabledSetting(
            component,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
          )
          Thread.sleep(200)
          pm.setComponentEnabledSetting(
            component,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
          )
          NotificationListenerService.requestRebind(component)
          Log.i(TAG, "requestRebind: toggle + requestRebind done")
        }
      } catch (e: Throwable) {
        Log.e(TAG, "requestRebind failed", e)
      }
    }
  }
}
