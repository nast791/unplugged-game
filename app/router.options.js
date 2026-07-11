import routerWrapper from '~/layouts/routerWrapper.vue';

export default {
  // https://router.vuejs.org/api/interfaces/routeroptions.html#routes
  routes: _routes => [
    {
      path: '',
      component: routerWrapper,
      meta: {},
      children: [
        {
          path: '',
          name: 'index',
          component: () => import('@/pages/index.vue'),
          meta: {
            seo: {
              title: 'Лобби',
            },
          },
        },
        {
          path: 'game',
          name: 'game',
          component: () => import('@/pages/game.vue'),
          meta: {
            seo: {
              title: 'Партия',
            },
          },
        },
      ],
    },
  ],
};
