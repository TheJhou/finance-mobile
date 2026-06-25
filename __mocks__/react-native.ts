// Mock react-native for unit testing

export const Platform = {
  OS: "ios",
  select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
};

export default { Platform };
