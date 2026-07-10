import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

const PROFILE_PHOTO_KEY = "profile_photo_uri";

function getProfileDir(): Directory {
  return new Directory(Paths.document, "profile");
}

export async function getProfilePhotoUri(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PROFILE_PHOTO_KEY);
  } catch {
    return null;
  }
}

export async function saveProfilePhoto(sourceUri: string): Promise<string> {
  const dir = getProfileDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  const ext = sourceUri.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `profile_photo.${ext}`;
  const destFile = new File(dir, fileName);

  // Handle content:// URIs (Android image picker) — File.copy doesn't support them
  if (sourceUri.startsWith("content://")) {
    // Read the content URI via fetch and write base64 to the destination file
    const response = await fetch(sourceUri);
    const blob = await response.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64Data = result.split(",")[1] || "";
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    destFile.write(base64, { encoding: "base64" } as any);
  } else {
    // file:// URIs can be copied directly
    const sourceFile = new File(sourceUri);
    if (sourceFile.exists) {
      sourceFile.copy(destFile);
    }
  }

  await AsyncStorage.setItem(PROFILE_PHOTO_KEY, destFile.uri);
  return destFile.uri;
}

export async function deleteProfilePhoto(): Promise<void> {
  try {
    const uri = await AsyncStorage.getItem(PROFILE_PHOTO_KEY);
    if (uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
      await AsyncStorage.removeItem(PROFILE_PHOTO_KEY);
    }
  } catch {
    // ignore
  }
}
