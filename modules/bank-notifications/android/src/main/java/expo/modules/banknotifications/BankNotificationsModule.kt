package expo.modules.banknotifications

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class BankNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BankNotifications")

    Events("onNotification", "onConnectionChange")

    Function("isPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      val enabledListeners = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ) ?: return@Function false
      val componentName =
        "${context.packageName}/${BankNotificationListenerService::class.java.name}"
      enabledListeners.split(":").any { it == componentName }
    }

    Function("isListenerConnected") {
      BankNotificationListenerService.isConnected
    }

    Function("requestRebind") {
      val context = appContext.reactContext ?: return@Function false
      BankNotificationListenerService.requestRebind(context)
      true
    }

    Function("openPermissionSettings") {
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    OnStartObserving {
      val weakModule = WeakReference(this@BankNotificationsModule)
      BankNotificationListenerService.listener = { payload ->
        weakModule.get()?.sendEvent("onNotification", payload)
      }
      BankNotificationListenerService.connectionCallback = { connected ->
        weakModule.get()?.sendEvent("onConnectionChange", mapOf("connected" to connected))
      }
    }

    OnStopObserving {
      BankNotificationListenerService.listener = null
      BankNotificationListenerService.connectionCallback = null
    }
  }
}
