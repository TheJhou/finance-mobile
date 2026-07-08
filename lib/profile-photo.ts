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

  // Copy from source to destination
  const sourceFile = new File(sourceUri);
  if (sourceFile.exists) {
    sourceFile.copy(destFile);
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
