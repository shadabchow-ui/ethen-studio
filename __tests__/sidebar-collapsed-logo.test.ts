/** Studio's current sidebar brand and collapse contracts. Pinned assets were
 * verified byte-for-byte against Chat's preserved source, independent of any
 * obsolete monolith apps directory. This is a source gate, not browser proof. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(join(root,'components/studio/v5/shell/StudioSidebar.tsx'),'utf8');
const css=readFileSync(join(root,'components/studio/v5/shell/studio-sidebar.module.css'),'utf8');
const chrome=readFileSync(join(root,'components/studio/StudioWorkbenchChrome.tsx'),'utf8');
assert(source.includes('src={railCollapsed ? "/brand/ethen-cube.png" : "/brand/ethen-logo.webp"}'));
assert(source.includes('alt="Ethen"') && source.includes('aria-label="Ethen Studio"'));
assert(source.includes('height={railCollapsed ? 24 : 18}') && source.includes('width={railCollapsed ? 24 : undefined}'));
assert(source.includes('data-collapsed={railCollapsed ? "true" : undefined}'));
assert(/\.brand img\s*\{[^}]*height: 18px;[^}]*width: auto/.test(css));
assert(/\.sidebar\[data-collapsed="true"\] \.brand img\s*\{[^}]*height: 24px;[^}]*width: 24px;[^}]*object-fit: contain/.test(css));
assert(/\.brand\s*\{[^}]*align-items: center;[^}]*min-height: 32px/.test(css));
assert(css.includes('.sidebar[data-collapsed="true"] { width: 52px; }'));
assert(/\.sidebar\[data-collapsed="true"\] \.brandRow\s*\{[^}]*justify-content: center/.test(css));
assert(source.includes('aria-expanded={!collapsed}') && chrome.includes('collapsed={sidebarPrefs.collapsed}'));
const pinned={'ethen-cube.png':'6d976eeb8bdf1b44caf9107e4111c2c4d559332a5f7845f203ef317d05c712bd','ethen-logo.webp':'c0e6030ae6f4167d923bc00ad89303d0bf82d3df763035d650377307e46af1b7'};
assert.deepEqual(readdirSync(join(root,'public/brand')).sort(), Object.keys(pinned).sort(), 'every shipped brand asset must have a preservation pin');
assert(css.includes('.sidebar[data-variant="drawer"] { width: min(300px, 86vw); }'), 'mobile drawer preserves responsive width');
assert(chrome.includes('onToggleCollapsed'), 'collapse remains interactive');
for(const [file,hash] of Object.entries(pinned))assert.equal(createHash('sha256').update(readFileSync(join(root,'public/brand',file))).digest('hex'),hash);
const cube=readFileSync(join(root,'public/brand/ethen-cube.png'));assert(cube.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'cube must be a PNG');assert.equal(cube.subarray(12,16).toString(),'IHDR');assert(cube.readUInt32BE(16)>0, 'cube dimensions must be positive');assert.equal(cube.readUInt32BE(16),cube.readUInt32BE(20));
console.log('SIDEBAR_EXPANDED_LOGO=PASS\nSIDEBAR_COLLAPSED_LOGO=PASS\nSIDEBAR_COLLAPSED_LOGO_CLIPPED=NO\nSIDEBAR_COLLAPSED_LOGO_BROKEN=NO\nSIDEBAR_LOGO_ASSET_FORKED=NO');
