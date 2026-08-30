'use client';

import { useEffect, useRef, useState } from 'react';
import { ALL_TOOL_NAMES, PUBLIC_TOOL_NAMES, SERVER_VERSION } from '@trustlists/mcp/version';
import styles from './HostScene.module.css';

type Drawer = 'search' | 'lookup' | 'browse' | 'audit';

const DRAWERS: Drawer[] = ['search', 'lookup', 'browse', 'audit'];

const LOCAL_ONLY: Drawer = 'audit';

const TOOL_NAMES: Record<Drawer, string> = {
  search: 'trustlists_search',
  lookup: 'trustlists_lookup',
  browse: 'trustlists_browse',
  audit: 'trustlists_audit_dependencies',
};

const LINES: Record<Drawer, string> = {
  search: 'Your assistant sends a company name. I say whether they publish a trust center.',
  lookup: 'One exact domain in, one public record out. I do not guess at matches.',
  browse: 'I filter by platform, listed framework, or CSA STAR level.',
  audit: 'Your lockfile never leaves your machine. That one runs from npx, not from me.',
};

/** Hold the boot screen long enough to read, even when /health answers instantly. */
const MIN_BOOT_MS = 1250;

type CopyTarget = 'url' | 'config';

export default function HostScene() {
  const robotRef = useRef<HTMLDivElement>(null);
  const bootStartRef = useRef(0);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState<Drawer | null>('search');
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [origin, setOrigin] = useState('');
  const [booting, setBooting] = useState(true);
  const [bootLeaving, setBootLeaving] = useState(false);

  useEffect(() => {
    bootStartRef.current = Date.now();
    setOrigin(window.location.origin);
    fetch('/health')
      .then((response) => response.json())
      .then((json) => setLive(Boolean(json?.ok)))
      .catch(() => setLive(false));
  }, []);

  useEffect(() => {
    if (live == null) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elapsed = Date.now() - bootStartRef.current;
    const hold = reduced ? 0 : Math.max(0, MIN_BOOT_MS - elapsed);

    const leave = window.setTimeout(() => setBootLeaving(true), hold);
    const unmount = window.setTimeout(() => setBooting(false), hold + (reduced ? 0 : 500));

    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(unmount);
    };
  }, [live]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const onMove = (event: PointerEvent) => {
      const box = robotRef.current?.getBoundingClientRect();
      if (!box) return;
      const cx = box.left + box.width * 0.5;
      const cy = box.top + box.height * 0.24;
      setLook({
        x: Math.max(-1, Math.min(1, (event.clientX - cx) / (box.width * 0.6))),
        y: Math.max(-1, Math.min(1, (event.clientY - cy) / (box.height * 0.5))),
      });
    };

    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const endpoint = origin ? `${origin}/mcp` : '/mcp';
  const pupilX = look.x * 5;
  const pupilY = look.y * 3.5;
  const tagLabel = open === LOCAL_ONLY ? 'PRIVATE' : 'PUBLIC';

  const configSnippet = `{
  "mcpServers": {
    "trustlists": {
      "url": "${endpoint}"
    }
  }
}`;

  const copy = async (text: string, target: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      window.setTimeout(() => setCopied((current) => (current === target ? null : current)), 1400);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className={styles.page}>
      {/* Fixed overlay, so it sits outside the page grid flow. */}
      {booting ? <BootScreen live={live} leaving={bootLeaving} /> : null}

      <header className={styles.top}>
        <p className={styles.brand}>trustlists_</p>
        <p className={`${styles.pulse} ${live ? styles.pulseLive : ''}`}>
          <span className={`${styles.dot} ${live ? styles.dotLive : ''}`} />
          {live == null ? 'checking' : live ? 'live' : 'offline'}
        </p>
      </header>

      <main className={styles.stage}>
        <div className={styles.robotWrap} ref={robotRef}>
          <svg
            className={styles.robot}
            viewBox="0 0 400 470"
            role="img"
            aria-label="trustlists robot with four tool drawers"
          >
            <g className={styles.bodySway}>
              <g className={styles.antenna}>
                <path d="M200 84 V52" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
                <circle
                  className={`${styles.ledRing} ${live ? styles.ledRingLive : ''}`}
                  cx="200"
                  cy="44"
                  r="8"
                />
                <circle className={`${styles.led} ${live ? styles.ledLive : ''}`} cx="200" cy="44" r="7" />
              </g>

              {/* head */}
              <rect
                x="124"
                y="88"
                width="152"
                height="112"
                rx="24"
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="3"
              />
              <rect x="146" y="112" width="108" height="64" rx="18" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />

              <ellipse cx="177" cy="144" rx="15" ry="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
              <ellipse cx="223" cy="144" rx="15" ry="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
              <ellipse cx={177 + pupilX} cy={144 + pupilY} rx="5.5" ry="6" fill="#0f172a" />
              <ellipse cx={223 + pupilX} cy={144 + pupilY} rx="5.5" ry="6" fill="#0f172a" />

              <rect x="182" y="184" width="36" height="7" rx="3.5" fill="#334155" />

              {/* arms */}
              <path
                d="M92 262 C74 220 104 196 132 212"
                fill="none"
                stroke="#0f172a"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path
                d="M308 262 C326 220 296 196 268 212"
                fill="none"
                stroke="#0f172a"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <g transform="rotate(-9 78 258)">
                <rect x="50" y="244" width="56" height="26" rx="5" fill="#fffbeb" stroke="#b45309" strokeWidth="2" />
                <text
                  key={tagLabel}
                  className={styles.tagText}
                  x="78"
                  y="261"
                  textAnchor="middle"
                  fill="#b45309"
                  fontSize="9"
                  fontWeight="600"
                  letterSpacing="1"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                >
                  {tagLabel}
                </text>
              </g>

              {/* cabinet */}
              <rect
                x="110"
                y="214"
                width="180"
                height="204"
                rx="16"
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="3"
              />

              {DRAWERS.map((drawer, index) => (
                <DrawerPlate
                  key={drawer}
                  y={228 + index * 46}
                  label={drawer}
                  local={drawer === LOCAL_ONLY}
                  open={open === drawer}
                  onToggle={() => setOpen(open === drawer ? null : drawer)}
                />
              ))}

              {/* feet */}
              <rect x="146" y="424" width="40" height="20" rx="6" fill="#0f172a" />
              <rect x="214" y="424" width="40" height="20" rx="6" fill="#0f172a" />
            </g>
          </svg>

          <div className={styles.speechSlot}>
            {open ? (
              <p className={styles.speech}>
                {LINES[open]}
                <span className={styles.caret}>▍</span>
              </p>
            ) : null}
          </div>
        </div>

        <section className={styles.copy}>
          <p className={styles.kicker}>Remote MCP endpoint</p>
          <h1 className={styles.title}>I only talk to machines.</h1>
          <p className={styles.lede}>
            Nothing to click here. Point Cursor, Claude, or anything else that speaks Streamable HTTP
            at the URL below, then ask your assistant about vendor trust centers.
          </p>

          <div className={styles.ticket}>
            <p className={styles.ticketLabel}>Endpoint</p>
            <p className={styles.endpoint}>{endpoint}</p>
            <button
              type="button"
              className={`${styles.copyBtn} ${copied === 'url' ? styles.copyBtnDone : ''}`}
              onClick={() => copy(endpoint, 'url')}
            >
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className={styles.config}>
            <div className={styles.configTop}>
              <span className={styles.configLabel}>Client config</span>
              <button
                type="button"
                className={`${styles.configCopy} ${copied === 'config' ? styles.configCopyDone : ''}`}
                onClick={() => copy(configSnippet, 'config')}
              >
                {copied === 'config' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className={styles.configPre}>
              <code>{configSnippet}</code>
            </pre>
          </div>

          <div className={styles.tools}>
            {DRAWERS.map((tool) => (
              <button
                key={tool}
                type="button"
                className={`${styles.chip} ${open === tool ? styles.chipOn : ''}`}
                onClick={() => setOpen(open === tool ? null : tool)}
              >
                <span className={styles.chipDot} />
                {TOOL_NAMES[tool]}
                {tool === LOCAL_ONLY ? <span className={styles.chipTag}>local</span> : null}
              </button>
            ))}
          </div>

          <p className={styles.note}>
            Three of the four tools answer here. The dependency audit reads your project manifests, so
            it only runs on the local install via <code>npx -y @trustlists/mcp</code>. Everything
            returned is public directory metadata, not an audit, certification, or security rating.
            Setup notes live on <a href="https://trustlists.org/mcp/">trustlists.org/mcp</a>.
          </p>
        </section>
      </main>

      <footer className={styles.floor}>
        <span>
          v{SERVER_VERSION} · {ALL_TOOL_NAMES.length} tools · {PUBLIC_TOOL_NAMES.length} served here
        </span>
      </footer>
    </div>
  );
}

function BootScreen({ live, leaving }: { live: boolean | null; leaving: boolean }) {
  const status = live == null ? 'Connecting' : live ? 'Ready' : 'Unavailable';

  return (
    <div
      className={`${styles.boot} ${leaving ? styles.bootLeaving : ''}`}
      role="status"
      aria-live="polite"
      aria-label={status}
    >
      <div className={styles.bootTop}>
        <p className={styles.brand}>trustlists_</p>
        <p className={`${styles.pulse} ${live ? styles.pulseLive : ''}`}>
          <span className={`${styles.dot} ${live ? styles.dotLive : ''}`} />
          {live == null ? 'checking' : live ? 'live' : 'offline'}
        </p>
      </div>

      <div className={styles.bootCaption}>
        <p className={styles.bootStatus}>{status}</p>
        <span className={styles.bootBar}>
          <span className={`${styles.bootBarFill} ${live != null ? styles.bootBarFillDone : ''}`} />
        </span>
      </div>

      <div className={styles.bootStage}>
        <svg className={styles.bootRobot} viewBox="0 0 200 200" aria-hidden="true">
          <g className={styles.bootAntenna}>
            <path d="M100 52 V20" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
            <circle className={`${styles.led} ${live ? styles.ledLive : ''}`} cx="100" cy="12" r="7" />
          </g>

          <rect
            x="24"
            y="56"
            width="152"
            height="112"
            rx="24"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="3"
          />
          <rect x="46" y="80" width="108" height="64" rx="18" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />

          <g className={styles.bootEyes}>
            <ellipse cx="77" cy="112" rx="15" ry="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
            <ellipse cx="123" cy="112" rx="15" ry="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
            <ellipse cx="77" cy="112" rx="5.5" ry="6" fill="#0f172a" />
            <ellipse cx="123" cy="112" rx="5.5" ry="6" fill="#0f172a" />
          </g>

          <rect x="82" y="152" width="36" height="7" rx="3.5" fill="#334155" />
        </svg>
      </div>
    </div>
  );
}

function DrawerPlate({
  y,
  label,
  local,
  open,
  onToggle,
}: {
  y: number;
  label: string;
  local: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const slide = open ? 'translate(10 0)' : undefined;

  return (
    <g
      className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={open}
      aria-label={local ? `Open ${label} drawer (local install only)` : `Open ${label} drawer`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <rect
        className={styles.drawerPlate}
        x="124"
        y={y}
        width="152"
        height="38"
        rx="8"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth="2"
        transform={slide}
      />
      <rect
        className={styles.drawerPull}
        x="188"
        y={y + 9}
        width="24"
        height="5"
        rx="2.5"
        fill="#94a3b8"
        transform={slide}
      />
      <text
        className={styles.drawerLabel}
        x="200"
        y={y + 29}
        textAnchor="middle"
        fill="#334155"
        fontSize="11"
        fontWeight="500"
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        transform={slide}
      >
        {label}
      </text>
    </g>
  );
}
