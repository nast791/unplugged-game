import { API } from './_map.js';

const PACKS = API.heroPacks;

const packsOptions = () => ({
  queryKey: [...PACKS.key],
  queryFn: () => $fetch(PACKS.route),
  staleTime: Infinity,
  gcTime: Infinity,
});

export const useHeroPacksQuery = () => useQuery(packsOptions());

export const useHeroPacks = () => {
  const queryClient = useQueryClient();
  const packs = useHeroPacksQuery();
  const load = () => queryClient.ensureQueryData(packsOptions());
  const heroPack = id => packs.data.value?.[String(id ?? '')] ?? null;

  return { packs, load, heroPack };
};

export const useHeroQuery = id =>
  useQuery({
    queryKey: computed(() => [...API.hero.key, String(toValue(id) ?? '')]),
    queryFn: () => $fetch(API.hero.route(toValue(id))),
    enabled: computed(() => Boolean(toValue(id))),
    staleTime: Infinity,
    gcTime: Infinity,
  });
