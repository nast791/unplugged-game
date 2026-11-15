import { computed, ref } from 'vue';
import { TIMEOUTS } from '#shared/constants/tuning.js';

const message = ref('');
let timer = null;

export const notify = (text, duration = TIMEOUTS.toast) => {
  message.value = String(text ?? '');
  clearTimeout(timer);
  timer = setTimeout(() => {
    message.value = '';
  }, duration);
};

export const clearToast = () => {
  clearTimeout(timer);
  message.value = '';
};

export const useToast = () => ({
  toast: computed(() => message.value),
  notify,
  clearToast,
});
