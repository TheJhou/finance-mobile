package expo.modules.banknotifications

import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue

class BankNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    Log.i(TAG, "Notification listener connected")
    isConnected = true
    connectionCallback?.invoke(true)

    // Replay any notifications that arrived while we were disconnected
    try {
      val active = getActiveNotifications()
      if (active.isNotEmpty()) {
        Log.i(TAG, "Replaying ${active.size} active notifications on reconnect")
        for (sbn in active) {
          onNotificationPosted(sbn)
        }
      }
    } catch (e: Throwable) {
      Log.w(TAG, "getActiveNotifications failed on connect", e)
    }
  }

  override fun onListenerDisconnected() {
    Log.w(TAG, "Notification listener disconnected")
    isConnected = false
    connectionCallback?.invoke(false)
    // Do NOT auto-requestRebind here — it causes a disconnect-rebind loop.
    // JS health check handles reconnection with proper backoff.
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
        val component = ComponentName(context, BankNotificationListenerService::class.java)
        // Use the official NotificationListenerService.requestRebind (API 24+)
        // This is the correct way to request a rebind — it does NOT disable/enable
        // the component, so it won't revoke the notification listener permission.
        NotificationListenerService.requestRebind(component)
        Log.i(TAG, "requestRebind: official API called successfully")
      } catch (e: Throwable) {
        Log.e(TAG, "requestRebind failed", e)
      }
    }
  }
}
