const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Config plugin for the BankNotifications native module.
 * Adds the NotificationListenerService to AndroidManifest.xml.
 */
const withBankNotifications = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    if (!app["service"]) app["service"] = [];

    const serviceName = "expo.modules.banknotifications.BankNotificationListenerService";
    const alreadyAdded = app["service"].some(
      (s) => s.$?.["android:name"] === serviceName
    );

    if (!alreadyAdded) {
      app["service"].push({
        $: {
          "android:name": serviceName,
          "android:label": "Bank Notification Listener",
          "android:permission": "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.service.notification.NotificationListenerService" } },
            ],
          },
        ],
      });
    }

    return cfg;
  });
};

module.exports = withBankNotifications;
