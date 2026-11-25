'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Search,X} from 'lucide-react';
import {workspaceLinks} from './Sidebar';
export function WorkspaceCommands({role}:{role:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [search,setSearch]=useState('');const [selected,setSelected]=useState(0);
 const router=useRouter();
 const results=workspaceLinks.filter(l=>l.roles.includes(role)&&l.label.toLowerCase().includes(search.toLowerCase()));
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearch('');setSelected(0);if(dialog.current?.open)dialog.current.close();else dialog.current?.showModal();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);
 function navigate(href:string){dialog.current?.close();router.push(href)}
 return <><button type="button" className="btn command-trigger" onClick={()=>{setSearch('');setSelected(0);dialog.current?.showModal()}} aria-label="Open quick navigation">Quick jump <kbd>Ctrl K</kbd></button><dialog ref={dialog} className="command-dialog" aria-labelledby="command-title" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}><h2 id="command-title">Quick navigation</h2><button className="command-close btn" aria-label="Close quick navigation" onClick={()=>dialog.current?.close()}><X size={16}/></button><div className="ops-search"><Search size={18}/><input autoFocus aria-label="Find a workspace page" value={search} onChange={e=>{setSearch(e.target.value);setSelected(0)}} placeholder="Where would you like to go?" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setSelected(i=>Math.min(i+1,results.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setSelected(i=>Math.max(0,i-1))}if(e.key==='Enter'&&results[selected]){e.preventDefault();navigate(results[selected].href)}}}/></div><div className="command-results">{results.map((l,i)=><button type="button" key={l.href} className={i===selected?'selected':''} onClick={()=>navigate(l.href)}><l.icon size={18}/>{l.label}<span>↵</span></button>)}{!results.length&&<p>No matching pages.</p>}</div><small>↑ ↓ to choose · Enter to open · Esc to close</small></dialog></>;
}
