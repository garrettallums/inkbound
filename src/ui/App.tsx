import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Editor } from '../editor/editor';
import { library } from '../editor/library';
import * as db from '../storage/db';
import { installTools } from '../tools';
import { Dashboard } from './Dashboard';
import { EditorView } from './EditorView';
import { ToastHost, toast } from './toast';
import { navigate, pendingEditors } from './router';

function parseRoute(): { page: 'dash' } | { page: 'map'; id: string } {
  const m = location.hash.match(/^#\/map\/([\w-]+)/);
  return m ? { page: 'map', id: m[1] } : { page: 'dash' };
}

export function App() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('hashchange', on);
    void library.load();
    void db.requestPersistence();
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return (
    <>
      {route.page === 'dash' ? <Dashboard /> : <EditorRoute key={route.id} id={route.id} />}
      <ToastHost />
    </>
  );
}

function EditorRoute({ id }: { id: string }) {
  const [editor, setEditor] = useState<Editor | null>(() => pendingEditors.get(id) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // (kept in the map until exit so StrictMode's double effect run can reuse it)
    let ed = pendingEditors.get(id) ?? null;
    (async () => {
      try {
        await library.load();
        if (!ed) {
          const stored = await db.loadProject(id);
          if (!stored) throw new Error('This map could not be found. It may have been deleted.');
          ed = await Editor.load(stored);
        }
        if (cancelled) return;
        installTools(ed);
        ed.toast = toast;
        setEditor(ed);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onExit = useCallback(async () => {
    if (editor) {
      await editor.save(true);
      editor.dispose();
      pendingEditors.delete(id);
    }
    navigate('#/');
  }, [editor, id]);

  if (error) {
    return (
      <div className="center-screen">
        <div>
          <p>{error}</p>
          <button className="btn" onClick={() => navigate('#/')}>Back to maps</button>
        </div>
      </div>
    );
  }
  if (!editor) {
    return (
      <div className="center-screen">
        <div className="row"><Loader2 className="spin" size={18} /> Opening map…</div>
      </div>
    );
  }
  return <EditorView editor={editor} onExit={onExit} />;
}
