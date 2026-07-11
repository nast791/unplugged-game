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
              title: 'Арена',
            },
          },
        },
        // {
        //   path: 'game/:id',
        //   name: 'game-id',
        //   component: () => import('@/pages/game.vue'),
        //   meta: {
        //     seo: {
        //       title: 'Битва',
        //     },
        //   },
        // },
      ],
    },
  ],
};
