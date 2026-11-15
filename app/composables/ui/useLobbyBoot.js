import { TIMEOUTS } from '#shared/constants/tuning.js';
import { useProfile } from './useProfile.js';

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

    const left = TIMEOUTS.lobbyBoot - (Date.now() - startedAt);
    if (left > 0) await new Promise(resolve => setTimeout(resolve, left));

    ready.value = true;
  };

  return { ready, content, boot };
};
