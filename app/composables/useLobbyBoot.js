import { useProfile } from './useProfile.js';

const MIN_VISIBLE_MS = 700;

export const useLobbyBoot = () => {
  const ready = useState('lobby:ready', () => false);
  const content = useState('lobby:content', () => null);
  const { load } = useProfile();

  const boot = async () => {
    if (ready.value) return;
    const startedAt = Date.now();
    load();

    await $fetch('/api/content/setup')
      .then(data => {
        content.value = data;
      })
      .catch(() => {
        content.value = null;
      });

    const left = MIN_VISIBLE_MS - (Date.now() - startedAt);
    if (left > 0) await new Promise(resolve => setTimeout(resolve, left));

    ready.value = true;
  };

  return { ready, content, boot };
};
