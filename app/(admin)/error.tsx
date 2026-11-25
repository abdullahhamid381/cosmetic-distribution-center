'use client';

export default function WorkspaceError({error}: {error: Error & {digest?: string}}) {
  return (
    <section className="card" aria-labelledby="workspace-error-title">
      <h2 id="workspace-error-title">This page couldn’t load</h2>
      <p className="muted">Reload the page to try again. If the problem continues, contact your administrator.</p>
      {error.digest && <p className="muted">Support reference <code>{error.digest}</code></p>}
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => window.location.reload()}>Reload page</button>
        <a className="btn" href="/">Return to workspace</a>
      </div>
    </section>
  );
}
