import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

const PROFILE_PHOTO_KEY = "profile_photo_uri";

type PhotoListener = (uri: string | null) => void;
const photoListeners = new Set<PhotoListener>();

export function onProfilePhotoChange(listener: PhotoListener): () => void {
  photoListeners.add(listener);
  return () => { photoListeners.delete(listener); };
}

function notifyPhotoChange(uri: string | null) {
  photoListeners.forEach((l) => l(uri));
}

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

export async function saveProfilePhoto(sourceUri: string, base64Data?: string): Promise<string> {
  const dir = getProfileDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  const fileName = "profile_photo.jpg";
  const destFile = new File(dir, fileName);

  if (base64Data) {
    // If base64 data is provided directly (from ImagePicker), write it
    destFile.write(base64Data, { encoding: "base64" } as any);
  } else if (sourceUri.startsWith("content://")) {
    // Fallback: try fetch → blob → base64 for content:// URIs
    const response = await fetch(sourceUri);
    const blob = await response.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        const data = result.split(",")[1] || "";
        resolve(data);
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
    } else {
      throw new Error("Arquivo de origem não encontrado");
    }
  }

  await AsyncStorage.setItem(PROFILE_PHOTO_KEY, destFile.uri);
  notifyPhotoChange(destFile.uri);
  return destFile.uri;
}

export async function deleteProfilePhoto(): Promise<void> {
  try {
    const uri = await AsyncStorage.getItem(PROFILE_PHOTO_KEY);
    if (uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
      await AsyncStorage.removeItem(PROFILE_PHOTO_KEY);
      notifyPhotoChange(null);
    }
  } catch {
    // ignore
  }
}
