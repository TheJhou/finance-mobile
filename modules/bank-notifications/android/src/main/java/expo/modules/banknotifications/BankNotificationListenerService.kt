package expo.modules.banknotifications

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class BankNotificationListenerService : NotificationListenerService() {
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
    } catch (_: Throwable) {
      // Silently ignore errors from JS-side handler.
    }
  }

  companion object {
    @Volatile
    var listener: ((Map<String, Any?>) -> Unit)? = null
  }
}
