package expo.modules.banknotifications

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BankNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BankNotifications")

    Events("onNotification")

    Function("isPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      val enabledListeners = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      )
      val componentName =
        "${context.packageName}/${BankNotificationListenerService::class.java.name}"
      enabledListeners != null && enabledListeners.contains(componentName)
    }

    Function("openPermissionSettings") {
      val context = appContext.reactContext ?: return@Function
      val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    OnStartObserving("onNotification") {
      BankNotificationListenerService.listener = { payload ->
        sendEvent("onNotification", payload)
      }
    }

    OnStopObserving("onNotification") {
      BankNotificationListenerService.listener = null
    }
  }
}
