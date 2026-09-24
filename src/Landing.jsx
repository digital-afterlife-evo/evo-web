import { useEffect, useRef, useState } from 'react';
import { Brand, Icon } from './Icons';
import MemoryField from './MemoryField';
import { sceneAt, letterAt, filmOffsets, advanceFilm, FILM_IDLE_SPEED } from './exhibition';
import './landing.css';

const chapters = ['序 · 未完', '忆 · 成形', '变 · 生长', '见 · 续写'];
const memories = ['说话的语气。', '一起经历的日常。', '看世界的方式。'];

export default function Landing({ navigate, continueSession, voice }) {
  const page = useRef(null);
  const motion = useRef({ progress: 0, x: 0, y: 0, reduced: false, burst: 0 });
  const film = useRef({ offset: 0, speed: FILM_IDLE_SPEED, boost: 0, scrollOffset: 0, pointer: null });
  const [chapter, setChapter] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [entering, setEntering] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const root = page.current;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const panels = [...root.querySelectorAll('.scene-copy')];
    let frame, filmFrame, previousTime = null;
    const update = () => {
      frame = null;
      const scroll = -root.getBoundingClientRect().top;
      const distance = root.offsetHeight - innerHeight;
      const { progress, chapter: current, visibility } = sceneAt(scroll, distance);
      motion.current.progress = progress;
      root.style.setProperty('--progress', progress / 3);
      const letter = letterAt(progress, motion.current.reduced);
      root.style.setProperty('--paper-travel', `${letter.travel}svh`);
      root.style.setProperty('--paper-tilt', `${letter.tilt}deg`);
      root.style.setProperty('--paper-memory', letter.memory);
      root.style.setProperty('--paper-opacity', letter.opacity);
      root.style.setProperty('--machine-opacity', letter.machine);
      const scrollOffset = filmOffsets(scroll, distance).down;
      if (!motion.current.reduced && !document.hidden) film.current.offset += scrollOffset - film.current.scrollOffset;
      film.current.scrollOffset = scrollOffset;
      panels.forEach((panel, i) => {
        panel.style.setProperty('--presence', visibility[i]);
        panel.style.setProperty('--offset', `${(i - progress) * 65}px`);
      });
      setChapter(current);
    };
    const schedule = () => { if (frame == null) frame = requestAnimationFrame(update); };
    const preferences = () => { motion.current.reduced = preference.matches; setReduced(preference.matches); schedule(); };
    const animateFilm = now => {
      if (document.hidden) return;
      filmFrame = requestAnimationFrame(animateFilm);
      if (motion.current.reduced) {
        previousTime = null; film.current.boost = 0; film.current.speed = FILM_IDLE_SPEED; film.current.pointer = null;
        return;
      }
      const elapsed = previousTime == null ? 0 : (now - previousTime) / 1000;
      previousTime = now;
      Object.assign(film.current, advanceFilm(film.current, elapsed));
      root.style.setProperty('--film-down', `${film.current.offset}px`);
      root.style.setProperty('--film-up', `${-film.current.offset}px`);
    };
    const visibility = () => {
      cancelAnimationFrame(filmFrame); previousTime = null;
      film.current.boost = 0; film.current.speed = FILM_IDLE_SPEED; film.current.pointer = null;
      if (!document.hidden) filmFrame = requestAnimationFrame(animateFilm);
    };
    preferences();
    visibility();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', preferences);
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(filmFrame); clearTimeout(timer.current);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', preferences);
    };
  }, []);

  function pointer(event) {
    if (motion.current.reduced || event.pointerType === 'touch') return;
    const now = performance.now();
    const previous = film.current.pointer;
    if (previous && now - previous.time < 150) {
      const velocity = Math.hypot(event.clientX - previous.x, event.clientY - previous.y) / Math.max(8, now - previous.time);
      film.current.boost = Math.max(film.current.boost, Math.min(500, velocity * 300));
    }
    film.current.pointer = { x: event.clientX, y: event.clientY, time: now };
    const box = event.currentTarget.getBoundingClientRect();
    motion.current.x = (event.clientX - box.left) / box.width - .5;
    motion.current.y = (event.clientY - box.top) / box.height - .5;
    page.current.style.setProperty('--pointer-x', `${motion.current.x * 25}px`);
    page.current.style.setProperty('--pointer-y', `${motion.current.y * 20}px`);
  }

  function jump(index) {
    const root = page.current;
    window.scrollTo({ top: window.scrollY + root.getBoundingClientRect().top + (root.offsetHeight - innerHeight) * index / 3, behavior: reduced ? 'instant' : 'smooth' });
  }

  function enter(event) {
    event.preventDefault();
    if (entering) return;
    if (reduced) { navigate('#conversation'); return; }
    setEntering(true);
    motion.current.burst = performance.now();
    timer.current = setTimeout(() => navigate('#conversation'), 850);
  }

  return <main className={`exhibition${reduced ? ' motion-paused' : ''}${entering ? ' is-entering' : ''}`} ref={page} data-scene={chapter} aria-label="数字余生互动展览">
    <span className="chapter-anchor anchor-memory" id="about" />
    <span className="chapter-anchor anchor-reunion" id="typewriter" />
    <div className="exhibition-stage" onPointerMove={pointer} onPointerLeave={() => { film.current.pointer = null; motion.current.x = 0; motion.current.y = 0; page.current.style.setProperty('--pointer-x', '0px'); page.current.style.setProperty('--pointer-y', '0px'); }}>
      <div className="stage-grid" aria-hidden="true" />
      <MemoryField motion={motion} />
      <header className="exhibition-header">
        <Brand light={chapter !== 1} onClick={event => { event.preventDefault(); jump(0); }} />
      </header>
      <div className="oversized-word" aria-hidden="true"><span>{chapter === 1 ? '记' : chapter === 2 ? '生' : '余'}</span><span>{chapter === 1 ? '忆' : chapter === 2 ? '长' : '生'}</span></div>
      <div className="world-object" aria-hidden="true">
        <div className="film-projector"><div className="film-strip film-strip-down" /><div className="film-strip film-strip-up" /></div>
        <div className="object-core"><span>未完<br />待续</span><small>STILL BECOMING</small></div>
        <div className="typewriter-assembly">
          <div className="emerging-letter">
            <div className="letter-greeting"><span>TO YOU, AGAIN.</span><p>见字如面。<br />对话，未完。</p><i /><small>A LIFE, STILL UNFOLDING.</small></div>
            <div className="letter-memories">{memories.map(text => <p key={text}>{text}</p>)}</div>
            <img className="letter-photo" src="/design/memory-photo.webp" alt="" width="1536" height="1024" decoding="async" />
          </div>
          <img src="/design/typewriter.webp" alt="" width="1313" height="1011" />
        </div>
        <span className="object-coordinate">{chapter === 2 ? 'EVOLUTION / OPEN ENDED' : 'MEMORY / MATTER / MEANING'}</span>
      </div>
      <div className="scene-container">
        <section className="scene-copy" style={{ '--presence': 1 }} inert={chapter !== 0} aria-hidden={chapter !== 0} aria-labelledby="origin-heading">
          <h1 id="origin-heading">人会离开。<br /><em>对话还在。</em></h1>
          <p className="scene-description">如果思念有了回音，<br />你想说的第一句话是什么？</p>
          <a className="scene-cta" href="#conversation" onClick={enter}><span>{continueSession ? '继续这段对话' : '与数字分身对话'}</span><span className="cta-disc"><Icon name="diagonal" /></span></a>
        </section>
        <section className="scene-copy" inert={chapter !== 1} aria-hidden={chapter !== 1} aria-labelledby="memory-heading">
          <h2 id="memory-heading">那些细节，<br /><em>让你是你。</em></h2>
          <p className="scene-description">以一个人的经历与表达微调 AI，<br />延续熟悉的语气，以及看世界的方式。<br /><span>让离开之后的交流，仍有一个入口。</span></p>
          <p className="sr-only">{memories.join('')}</p>
          <button className="scene-text-link" onClick={() => jump(2)}>但记忆，不是终点 <Icon name="arrow" /></button>
        </section>
        <section className="scene-copy" inert={chapter !== 2} aria-hidden={chapter !== 2} aria-labelledby="evolution-heading">
          <h2 id="evolution-heading">生命在于<br /><em>变化。</em><span className="heading-asterisk">＊</span></h2>
          <p className="scene-description">保存过去，也为新的经历留下位置。<br />我们希望，数字分身不止停在某一天。</p>
          <p className="evolution-note"><span>THE NEXT CHAPTER</span>逐步接入 Evolver，让对话成为持续演化的起点。</p>
        </section>
        <section className="scene-copy" inert={chapter !== 3} aria-hidden={chapter !== 3} aria-labelledby="reunion-heading">
          <h2 id="reunion-heading">好久不见。<br /><em>聊聊今天？</em></h2>
          <p className="scene-description">打字机落下的每一笔，<br />都是现实与数字生命之间的一次往返。<br /><span>即使有一天，人已离开。</span></p>
          <a className="scene-cta" href="#conversation" onClick={enter}><span>写下第一句话</span><span className="cta-disc"><Icon name="diagonal" /></span></a>
          <button className="scene-voice" onClick={voice}><Icon name="mic" /> 用声音开始</button>
        </section>
      </div>
      <footer className="exhibition-footer">
        <button className="scroll-invitation" onClick={() => jump(chapter === 3 ? 0 : chapter + 1)}><span className="scroll-track"><i /></span><span>{chapter === 3 ? '重温这场相遇' : '滚动，穿过记忆'}<small>{chapter === 3 ? 'BACK TO THE BEGINNING' : 'SCROLL TO EXPLORE'}</small></span></button>
        <nav className="chapter-navigation" aria-label="展览章节">{chapters.map((label, i) => <button key={label} onClick={() => jump(i)} aria-current={chapter === i ? 'step' : undefined}><span className="chapter-line" /><span>{label}</span></button>)}</nav>
      </footer>
      <div className="exhibition-progress" aria-hidden="true"><i /></div>
      <div className="entry-veil" aria-hidden="true"><span>让对话，继续。</span></div>
    </div>
  </main>;
}
