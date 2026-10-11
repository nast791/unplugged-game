export const API = {
  heroPacks: {
    route: '/api/content/heroes',
    key: ['hero-packs'],
    method: 'get',
  },
  hero: {
    route: id => `/api/content/heroes/${id}`,
    key: ['hero'],
    method: 'get',
  },
};

export default API;
