export type NamedProfile = {
  id: string;
  name: string;
};

export const normalizeProfileName = (value: string): string => value.trim();

export const profileNameKey = (value: string): string =>
  normalizeProfileName(value).normalize("NFKC").toLocaleLowerCase("en-US");

export const createProfileCopyName = (
  originalName: string,
  existingProfiles: readonly NamedProfile[],
): string => {
  const baseName = `Copy of ${normalizeProfileName(originalName) || "Profile"}`;
  const usedKeys = new Set(existingProfiles.map((profile) => profileNameKey(profile.name)));
  let name = baseName;
  let suffix = 2;

  while (usedKeys.has(profileNameKey(name))) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return name;
};

export const uniquifyProfileNames = <Profile extends NamedProfile>(
  profiles: Profile[],
): Profile[] => {
  const usedKeys = new Set<string>();

  return profiles.map((profile) => {
    const baseName = normalizeProfileName(profile.name) || "Profile";
    let name = baseName;
    let suffix = 2;

    while (usedKeys.has(profileNameKey(name))) {
      name = `${baseName} (${suffix})`;
      suffix += 1;
    }

    usedKeys.add(profileNameKey(name));
    return { ...profile, name };
  });
};
