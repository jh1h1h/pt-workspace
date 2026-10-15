import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PanelLeft,
  Search,
  Plus,
  House,
  CheckSquare,
  Files,
  Globe,
  Layers,
  ListTodo,
  FlaskConical,
  Flag,
  Paperclip,
  Settings as SettingsIcon,
} from "lucide-react";
import { api } from "../api/client";
import { keys, usePages } from "../api/queries";
import { saves, useDirty } from "../hooks/saveCoordinator";
import { Button } from "../components/ui/button";
import { SearchDialog } from "../components/SearchDialog";
import { PageTree } from "../components/PageTree";
import { CreatePageDialog } from "../components/CreatePageDialog";
export function Shell() {
  const { eid = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const engagements = useQuery({
    queryKey: keys.engagements,
    queryFn: api.engagements,
  });
  const pages = usePages(eid);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState(false);
  const [createPage, setCreatePage] = useState(false);
  const dirty = useDirty();
  const blocker = useBlocker(dirty);
  const [navError, setNavError] = useState("");
  useEffect(() => {
    if (blocker.state === "blocked") {
      setNavError("");
      void saves
        .flush()
        .then(() => blocker.proceed())
        .catch((e) =>
          setNavError(e instanceof Error ? e.message : "Save failed"),
        );
    }
  }, [blocker]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (saves.dirty()) {
        saves.shutdown();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    const shortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
      if (e.key === "Escape") setSearch(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);
  const route = location.pathname.split("/")[3] ?? "home";
  const pageId = location.pathname.split("/")[4];
  const routeLabels: Record<string, string> = {
    home: "Home",
    tasks: "My Tasks",
    pages: "All Pages",
    assets: "Scope & Assets",
    "attack-surfaces": "Attack Surfaces",
    backlog: "Testing Backlog",
    "test-cases": "Test Cases",
    findings: "Findings",
    evidence: "Evidence",
    settings: "Settings & Templates",
  };
  const routeSubtitles: Record<string, string> = {
    home: "A quiet place to pick up where you left off.",
    tasks: "Personal work, independent of the testing backlog.",
    pages: "Browse and organize this engagement’s pages.",
    assets: "Document approved boundaries and maintain the asset inventory.",
    "attack-surfaces": "Structured surfaces and retained discovery provenance.",
    backlog: "Technical assessment objectives, separate from Personal Tasks.",
    "test-cases": "Execution status and assessment outcome remain independent.",
    findings: "Candidates require explicit verification before confirmation.",
    evidence: "Local evidence, review state, and linked context.",
    settings: "Workspace preferences, templates, recovery, and customization.",
  };
  const currentPage = pageId ? pages.data?.find((page) => page.id === pageId) : undefined;
  const pageAncestors = [];
  let parentId = currentPage?.parent_id;
  const seenParents = new Set<string>();
  while (parentId && !seenParents.has(parentId)) {
    seenParents.add(parentId);
    const parent = pages.data?.find((page) => page.id === parentId);
    if (!parent) break;
    pageAncestors.unshift(parent);
    parentId = parent.parent_id;
  }
  const pageHeading = routeLabels[route] ?? "Workspace";
  const pageSubtitle = pageId
    ? ""
    : (routeSubtitles[route] ?? "Local, focused, and stored on this machine.");
  const vaptNav = [
    ["assets", "Scope & Assets", Globe],
    ["attack-surfaces", "Attack Surfaces", Layers],
    ["backlog", "Testing Backlog", ListTodo],
    ["test-cases", "Test Cases", FlaskConical],
    ["findings", "Findings", Flag],
    ["evidence", "Evidence", Paperclip],
  ] as const;
  const nav = [
    ["home", "Home", House],
    ["tasks", "My Tasks", CheckSquare],
    ["pages", "All Pages", Files],
  ] as const;
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <span className="brand-mark">V</span>
          {!collapsed ? <strong>VAPT Workspace</strong> : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            <PanelLeft size={16} />
          </Button>
        </div>
        {!collapsed ? (
          <>
            <label className="engagement-label">
              ENGAGEMENT
              <select
                aria-label="Engagement switcher"
                value={eid}
                onChange={(e) => void navigate(`/e/${e.target.value}/home`)}
              >
                {engagements.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sidebar-actions">
              <Button variant="ghost" onClick={() => setSearch(true)}>
                <Search size={15} /> Search <kbd>⌘ K</kbd>
              </Button>
              <Button variant="ghost" onClick={() => setCreatePage(true)}>
                <Plus size={15} /> New page
              </Button>
            </div>
            <p className="nav-group">PERSONAL WORKSPACE</p>
          </>
        ) : null}
        <nav>
          {nav.map(([path, label, Icon]) => (
            <NavLink
              end
              key={path}
              aria-label={label}
              title={label}
              to={`/e/${eid}/${path}`}
            >
              <Icon size={16} />
              {!collapsed ? label : null}
            </NavLink>
          ))}
        </nav>
        {!collapsed ? (
          <>
            <p className="nav-group">PINNED</p>
            {pages.data
              ?.filter((p) => p.favorite)
              .map((p) => (
                <Link
                  className="pinned-link"
                  key={p.id}
                  to={`/e/${eid}/pages/${p.id}`}
                >
                  ★ {p.title}
                </Link>
              ))}
            <PageTree pages={pages.data ?? []} label="PAGES" />
            <p className="nav-group">VAPT WORKSPACE</p>
            <nav>
              {vaptNav.map(([path, label, Icon]) => (
                <NavLink
                  key={path}
                  title={label}
                  aria-label={label}
                  to={`/e/${eid}/${path}`}
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </nav>
            <p className="nav-group">OTHER</p>
            <p className="planned-item">
              Activity History <small>Phase 4</small>
            </p>
          </>
        ) : null}
        {collapsed ? (
          <nav>
            {vaptNav.map(([path, label, Icon]) => (
              <NavLink
                key={path}
                title={label}
                aria-label={label}
                to={`/e/${eid}/${path}`}
              >
                <Icon size={16} />
              </NavLink>
            ))}
          </nav>
        ) : null}
        <nav>
          <NavLink aria-label="Settings & Templates" to={`/e/${eid}/settings`}>
            <SettingsIcon size={16} />
            {!collapsed ? "Settings & Templates" : null}
          </NavLink>
        </nav>
        {!collapsed ? (
          <div className="sidebar-footer">
            <span className="local-dot" /> Local workspace · Phase 2
            <Link to="/">Manage engagements</Link>
          </div>
        ) : null}
      </aside>
      <div className="main-wrapper">
        <header className="topbar">
          {pageId ? <nav className="topbar-breadcrumbs" aria-label="Breadcrumbs"><Link to={`/e/${eid}/pages`}>All Pages</Link>{pageAncestors.map(parent => <span key={parent.id}> / <Link to={`/e/${eid}/pages/${parent.id}`}>{parent.title}</Link></span>)}<span> / {currentPage?.title ?? "Page"}</span></nav> : <strong>{pageHeading}</strong>}
          {pageSubtitle ? <span className="muted">{pageSubtitle}</span> : null}
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {search ? (
        <SearchDialog eid={eid} onClose={() => setSearch(false)} />
      ) : null}
      {createPage ? <CreatePageDialog eid={eid} onClose={() => setCreatePage(false)} onCreated={(page) => void navigate(`/e/${eid}/pages/${page.id}`)} /> : null}
      {blocker.state === "blocked" && navError ? (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved changes"
            className="dialog"
          >
            <h2>Your changes haven’t saved</h2>
            <p role="alert">{navError}</p>
            <p>Stay on this page to retry or download your unsaved document.</p>
            <Button
              onClick={() => {
                blocker.reset();
                setNavError("");
              }}
            >
              Stay on page
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
