const STORAGE_KEY = 'unplugged.profile.v1';

export const DEFAULT_NICK = 'Игрок';

const emptyProfile = () => ({
  nick: '',
  avatar: '',
  currency: 0,
  createdAt: null,
});

export const useProfile = () => {
  const profile = useState('profile', () => null);

  const persist = () => {
    if (typeof localStorage === 'undefined' || !profile.value) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile.value));
    } catch {
    }
  };

  const load = () => {
    if (profile.value) return profile.value;
    let stored = null;
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    profile.value = {
      ...emptyProfile(),
      ...(stored ?? {}),
      createdAt: stored?.createdAt ?? new Date().toISOString(),
    };
    if (!stored) persist();
    return profile.value;
  };

  const patch = values => {
    if (!profile.value) load();
    profile.value = { ...profile.value, ...values };
    persist();
  };

  const nick = computed(() => profile.value?.nick?.trim() || DEFAULT_NICK);
  const currency = computed(() => Number(profile.value?.currency) || 0);
  const avatar = computed(() => profile.value?.avatar || '');

  return {
    profile,
    nick,
    currency,
    avatar,
    load,
    setNick: value =>
      patch({
        nick: String(value ?? '')
          .trim()
          .slice(0, 24),
      }),
    setAvatar: value =>
      patch({
        avatar: String(value ?? '').trim(),
      }),
  };
};
