(function initSiteConfig(root) {
  'use strict';

  const groups = [
    {
      id: 'home',
      label: '홈',
      icon: 'layers',
      pages: [{ id: 'home', href: '/', label: '홈', nav: '홈', icon: 'layers' }],
    },
    {
      id: 'markets',
      label: '금융시장',
      icon: 'chart',
      pages: [
        { id: 'stock', href: '/stock', label: '주요 증시', nav: '주식', icon: 'chart' },
        { id: 'kosdaq', href: '/kosdaq', label: '코스닥 종목', nav: '코스닥', icon: 'chart' },
        { id: 'coin', href: '/coin', label: '코인', nav: '코인', icon: 'coin' },
        { id: 'fx', href: '/fx', label: '환율', nav: '환율', icon: 'fx' },
      ],
    },
    {
      id: 'commodities',
      label: '원자재·지표',
      icon: 'gem',
      pages: [
        { id: 'metal', href: '/metal', label: '귀금속', nav: '금·은', icon: 'gem' },
        { id: 'energy', href: '/energy', label: '에너지·원자재', nav: '유가', icon: 'oil' },
        { id: 'macro', href: '/macro', label: '경제지표·금리', nav: '지표', icon: 'gauge' },
      ],
    },
    {
      id: 'living',
      label: '생활시세',
      icon: 'home',
      pages: [
        { id: 'giftcard', href: '/giftcard', label: '상품권', nav: '상품권', icon: 'ticket' },
        { id: 'realestate', href: '/realestate', label: '부동산', nav: '부동산', icon: 'home' },
      ],
    },
    {
      id: 'tools',
      label: '혜택·도구',
      icon: 'target',
      pages: [
        { id: 'hotdeal', href: '/hotdeal', label: '핫딜', nav: '핫딜', icon: 'flame' },
        { id: 'lotto', href: '/lotto', label: '로또', nav: '로또', icon: 'target' },
      ],
    },
  ];

  for (const group of groups) {
    for (const page of group.pages) Object.freeze(page);
    Object.freeze(group.pages);
    Object.freeze(group);
  }

  const pages = Object.freeze(groups.flatMap((group) =>
    group.pages.map((page) => Object.freeze({ ...page, groupId: group.id })),
  ));
  const config = Object.freeze({ groups: Object.freeze(groups), pages });

  root.MODOO_SITE_CONFIG = config;
  if (typeof module === 'object' && module.exports) module.exports = config;
})(typeof globalThis === 'object' ? globalThis : this);
