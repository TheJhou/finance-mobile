package expo.modules.banknotifications

import android.content.ComponentName
import android.content.Context
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
    try {
      cb.invoke(payload)
    } catch (e: Throwable) {
      Log.e(TAG, "Error dispatching notification to JS", e)
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

    fun requestRebind(context: Context) {
      try {
        val pm = context.packageManager
        val component = ComponentName(context, BankNotificationListenerService::class.java)

        pm.setComponentEnabledSetting(
          component,
          android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          android.content.pm.PackageManager.DONT_KILL_APP
        )
        pm.setComponentEnabledSetting(
          component,
          android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
          android.content.pm.PackageManager.DONT_KILL_APP
        )
        Log.i(TAG, "requestRebind: component toggled via PackageManager")
      } catch (e: Throwable) {
        Log.e(TAG, "requestRebind failed", e)
      }
    }
  }
}
