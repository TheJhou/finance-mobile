package expo.modules.banknotifications

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue

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
      // JS listener is null (app in background or not observing) — buffer for later
      if (bufferedNotifications.size < MAX_BUFFER) {
        bufferedNotifications.add(payload)
        Log.i(TAG, "Notification buffered (JS listener null, buffer=${bufferedNotifications.size}, pkg=${sbn.packageName})")
      } else {
        Log.w(TAG, "Buffer full — dropping notification (pkg=${sbn.packageName})")
      }
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
    val bufferedNotifications = ConcurrentLinkedQueue<Map<String, Any?>>()

    fun drainBufferedNotifications(): List<Map<String, Any?>> {
      val drained = mutableListOf<Map<String, Any?>>()
      while (true) {
        val item = bufferedNotifications.poll() ?: break
        drained.add(item)
      }
      if (drained.isNotEmpty()) {
        Log.i(TAG, "Drained ${drained.size} buffered notifications")
      }
      return drained
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
