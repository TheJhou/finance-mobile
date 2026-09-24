import Constants from "expo-constants";
import { Platform } from "react-native";

/** Identificação do aparelho enviada ao backend, exibida em "Sessões ativas". */
export function getDeviceInfo(): { name: string; platform: string } {
  const name = Constants.deviceName?.trim() || (Platform.OS === "ios" ? "iPhone" : "Android");
  return { name: name.slice(0, 100), platform: Platform.OS };
}
