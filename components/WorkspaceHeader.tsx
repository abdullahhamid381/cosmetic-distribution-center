'use client';

import {useState, type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Search, Smartphone, X} from 'lucide-react';
import {logout} from '@/app/actions';
import {workspaceGroups, workspaceLinks} from './Sidebar';
import {WorkspaceCommands} from './WorkspaceCommands';
import {WorkspaceThemeToggle} from './WorkspaceThemeToggle';

export function WorkspaceHeader({name,role,balance}: {name:string; role:string; balance?:ReactNode}) {
  const path = usePathname();
  const [search,setSearch] = useState('');
  const [collapsed,setCollapsed] = useState(false);
  const allowedLinks = workspaceLinks.filter(link => link.roles.includes(role));
  const current = allowedLinks.reduce<(typeof workspaceLinks)[number] | undefined>((best, link) => {
    if (path !== link.href && !path.startsWith(link.href + '/')) return best;
    return !best || link.href.length > best.href.length ? link : best;
  }, undefined);
  const section = workspaceGroups.find(group => current && group.paths.includes(current.href));
  const term = search.trim().toLowerCase();
  const results = allowedLinks.filter(link => link.label.toLowerCase().includes(term));
  const CurrentIcon = current?.icon ?? LayoutDashboard;

  return (
    <header className="topbar no-print" data-collapsed={collapsed}>
      <button type="button" className="sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed} aria-controls="workspace-navigation" onClick={() => setCollapsed(!collapsed)}><ChevronLeft size={18}/></button>
      <div className="workspace-location">
        <span className="workspace-location-icon"><CurrentIcon size={17} aria-hidden="true"/></span>
        <span className="workspace-location-text">
          {section && <><small>{section.title}</small><ChevronRight size={13} aria-hidden="true"/></>}
          <strong>{current?.label ?? 'Workspace'}</strong>
        </span>
      </div>
      <div className="workspace-search">
        <Search size={17} aria-hidden="true"/>
        <input aria-label="Search workspace pages" placeholder="Find a workspace page…" value={search}
          onChange={event => setSearch(event.target.value)} onKeyDown={event => {if (event.key === 'Escape') setSearch('');}}/>
        {search && <button aria-label="Clear search" type="button" onClick={() => setSearch('')}><X size={15}/></button>}
        {term && <div className="search-results">{results.length ? results.map(link => (
          <Link href={link.href} key={link.href} onClick={() => setSearch('')}><link.icon size={17}/>{link.label}</Link>
        )) : <p>No pages found.</p>}</div>}
      </div>
      <WorkspaceCommands role={role}/>
      <div className="top-right">
        {balance}
        <WorkspaceThemeToggle/>
        <details className="workspace-profile" key={path}>
          <summary aria-label="Account menu">
            <span className="top-initial">{name.slice(0,1).toUpperCase()}</span>
            <span className="workspace-profile-name">{name.split(' ')[0]}</span>
            <ChevronDown size={14} aria-hidden="true"/>
          </summary>
          <div className="workspace-profile-menu">
            <strong>{name}</strong><small>{role}</small>
            <Link href="/install"><Smartphone size={15} aria-hidden="true"/> Install mobile app</Link>
            <form action={logout}><button type="submit"><LogOut size={15}/> Sign out</button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
