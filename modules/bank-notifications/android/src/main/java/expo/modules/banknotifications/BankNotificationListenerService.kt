package expo.modules.banknotifications

import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class BankNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    Log.i(TAG, "Notification listener connected")
    isConnected = true
    connectionCallback?.invoke(true)
  }

  override fun onListenerDisconnected() {
    Log.w(TAG, "Notification listener disconnected — requesting rebind")
    isConnected = false
    connectionCallback?.invoke(false)
    try {
      requestRebind()
    } catch (e: Throwable) {
      Log.e(TAG, "requestRebind failed", e)
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val cb = listener ?: return
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
    try {
      cb.invoke(payload)
    } catch (e: Throwable) {
      Log.e(TAG, "Error dispatching notification to JS", e)
    }
  }

  companion object {
    private const val TAG = "BankNotifService"

    @Volatile
    var isConnected: Boolean = false

    @Volatile
    var listener: ((Map<String, Any?>) -> Unit)? = null

    @Volatile
    var connectionCallback: ((Boolean) -> Unit)? = null

    fun requestRebind(context: Context) {
      try {
        val intent = Intent(context, BankNotificationListenerService::class.java)
        context.startService(intent)
        Log.i(TAG, "requestRebind: startService sent")
      } catch (e: Throwable) {
        Log.e(TAG, "requestRebind failed", e)
      }
    }
  }
}
