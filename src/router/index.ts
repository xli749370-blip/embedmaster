import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // 使用 hash 模式：构建产物可直接双击打开或部署到任意静态托管，无需服务端重写规则
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: '首页' },
    },
    {
      path: '/courses',
      name: 'courses',
      component: () => import('@/views/CoursesView.vue'),
      meta: { title: '课程中心' },
    },
    {
      path: '/course/:id',
      name: 'course-detail',
      component: () => import('@/views/CourseDetailView.vue'),
      meta: { title: '课程详情' },
    },
    {
      path: '/chapter/:id',
      name: 'chapter',
      component: () => import('@/views/ChapterView.vue'),
      meta: { title: '讲义阅读' },
    },
    {
      path: '/quiz/:chapterId?',
      name: 'quiz',
      component: () => import('@/views/QuizView.vue'),
      meta: { title: '在线刷题' },
    },
    {
      path: '/assess',
      name: 'assess',
      component: () => import('@/views/AssessmentView.vue'),
      meta: { title: '效果检测' },
    },
    {
      path: '/circuit',
      name: 'circuit',
      component: () => import('@/views/CircuitLabView.vue'),
      meta: { title: '电路分析训练' },
    },
    {
      path: '/components',
      name: 'components',
      component: () => import('@/views/ComponentsView.vue'),
      meta: { title: '元器件百科' },
    },
    {
      path: '/codelib',
      name: 'codelib',
      component: () => import('@/views/CodeLibView.vue'),
      meta: { title: '代码库' },
    },
    {
      path: '/wrongbook',
      name: 'wrongbook',
      component: () => import('@/views/WrongBookView.vue'),
      meta: { title: '错题本' },
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/ProjectsView.vue'),
      meta: { title: '项目库' },
    },
    {
      path: '/learn',
      name: 'learn-index',
      component: () => import('@/views/LearnIndexView.vue'),
      meta: { title: '学习中心' },
    },
    {
      path: '/learn/:id',
      name: 'learn',
      component: () => import('@/views/LearnView.vue'),
      meta: { title: '理论课程' },
    },
    {
      path: '/meditate',
      name: 'meditate',
      component: () => import('@/views/MeditateView.vue'),
      meta: { title: '冥想学习' },
    },
    {
      path: '/esp32',
      name: 'esp32',
      component: () => import('@/views/Esp32View.vue'),
      meta: { title: 'ESP32 平台' },
    },
    {
      path: '/datasheets',
      name: 'datasheets',
      component: () => import('@/views/DatasheetsView.vue'),
      meta: { title: '数据手册' },
    },
    {
      path: '/roadmap',
      name: 'roadmap',
      component: () => import('@/views/RoadmapView.vue'),
      meta: { title: '学习地图' },
    },
    {
      path: '/ai',
      name: 'ai',
      component: () => import('@/views/AiView.vue'),
      meta: { title: 'AI 答疑' },
    },
    {
      path: '/lab',
      name: 'lab',
      component: () => import('@/views/LabView.vue'),
      meta: { title: '动画实验室' },
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchView.vue'),
      meta: { title: '搜索讲义' },
    },
    {
      path: '/report',
      name: 'report',
      component: () => import('@/views/ReportView.vue'),
      meta: { title: '学习周报' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { title: '个人中心' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: '页面不存在' },
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'EmbedMaster'
  document.title = `${title} · EmbedMaster`
})

export default router
