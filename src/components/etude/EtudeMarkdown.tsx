"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Rendu Markdown sobre pour l'Étude Guidée (synthèse + explication). Styles auto-suffisants (couleur/taille
// héritées de la carte → fonctionne en thème clair comme sombre). Le prompt reste sobre : gras, citation,
// listes, tableaux rares. Les titres éventuels sont dégradés en texte gras (garde-fou, jamais de gros titres).
export default function EtudeMarkdown({ children, className }: { children?: string | null; className?: string }) {
  return (
    <div className={className} style={{ lineHeight: 1.75, color: 'inherit' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: '0 0 0.9em' }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          ul: ({ children }) => <ul style={{ margin: '0 0 0.9em', paddingLeft: '1.4em' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0 0 0.9em', paddingLeft: '1.4em' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '0.3em 0' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{ margin: '0 0 0.9em', padding: '0.7em 1em', borderLeft: '3px solid rgba(129,140,248,0.6)', background: 'rgba(129,140,248,0.08)', borderRadius: 6 }}>{children}</blockquote>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '0 0 0.9em' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th style={{ border: '1px solid rgba(148,163,184,0.35)', padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>{children}</th>,
          td: ({ children }) => <td style={{ border: '1px solid rgba(148,163,184,0.35)', padding: '6px 10px' }}>{children}</td>,
          code: ({ children }) => <code style={{ background: 'rgba(148,163,184,0.15)', padding: '1px 5px', borderRadius: 4, fontSize: '0.92em' }}>{children}</code>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }}>{children}</a>,
          h1: ({ children }) => <p style={{ fontWeight: 700, margin: '0 0 0.6em' }}>{children}</p>,
          h2: ({ children }) => <p style={{ fontWeight: 700, margin: '0 0 0.6em' }}>{children}</p>,
          h3: ({ children }) => <p style={{ fontWeight: 700, margin: '0 0 0.6em' }}>{children}</p>,
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
