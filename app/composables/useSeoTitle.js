export const useSeoTitle = title => {
  useHead({
    title: () => (typeof title === 'function' ? title() : unref(title)) || '',
  });
};
