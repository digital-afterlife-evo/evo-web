export function Icon({ name, ...props }) {
  const paths = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    diagonal: <><path d="M5 19 19 5M5 5h14v14" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 4v16M4 12h16" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="1" /><path d="M16 8V3H3v13h5" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    back: <path d="M20 12H5m6-7-7 7 7 7" />,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.arrow}</svg>;
}

export function Brand({ light = false, onClick }) {
  return <a className={`brand ${light ? 'brand-light' : ''}`} href="#" onClick={onClick} aria-label="数字余生，返回首页">
    <img src="/design/title.svg" alt="数字余生" width="263" height="59" />
    <span className="brand-caption">THE UNFINISHED LETTER</span>
  </a>;
}
