import {
  Home, BookOpenText, Library, Layers, GraduationCap, PenLine,
  FolderOpen, FileText, Target, LineChart, type LucideIcon,
} from 'lucide-react';

/**
 * Navigation de l'application, regroupée par intention. Trois comportements de visibilité,
 * à ne pas confondre :
 *
 *   freeOnly      — retiré du menu en Premium (le Catalogue est la vitrine du plan gratuit).
 *   hiddenForFree — retiré du menu en Free, sans cadenas : pour un compte gratuit, le Catalogue
 *                   EST l'étude guidée ; afficher les deux ferait croire à deux outils concurrents.
 *   premiumOnly   — visible en Free avec un cadenas : l'étudiant voit ce que le Premium apporte.
 *
 * Aucun drapeau ne protège quoi que ce soit : chaque page et chaque action revérifient le plan
 * côté serveur.
 */
/**
 * Chaque section a sa couleur, comme les onglets d'un classeur de révision : on reconnaît
 * la section d'un coup d'œil, et l'entrée active « s'allume » dans sa propre teinte.
 * `ink` sert au texte et à l'icône (contraste ≥ 4,5:1 sur `soft`), `soft` au fond allumé,
 * `glow` au halo bref qui accompagne le clic.
 */
export type NavTone = 'prusse' | 'surligneur' | 'sauge' | 'garance' | 'encre' | 'ocre' | 'lagune' | 'prune';

export const TONES: Record<NavTone, { ink: string; soft: string; glow: string }> = {
  prusse:     { ink: '#1E5A96', soft: '#E8F0F7', glow: 'rgba(30, 90, 150, 0.35)' },
  surligneur: { ink: '#8A5A00', soft: '#FFF3C4', glow: 'rgba(255, 210, 60, 0.6)' },
  sauge:      { ink: '#26734D', soft: '#E3F3EA', glow: 'rgba(38, 115, 77, 0.35)' },
  garance:    { ink: '#B42E2E', soft: '#FCE9E7', glow: 'rgba(214, 64, 52, 0.38)' },
  encre:      { ink: '#5B3FB0', soft: '#EFEAFB', glow: 'rgba(91, 63, 176, 0.35)' },
  ocre:       { ink: '#A6501A', soft: '#FCEEE2', glow: 'rgba(214, 120, 50, 0.38)' },
  lagune:     { ink: '#0E6F6C', soft: '#E1F3F2', glow: 'rgba(14, 140, 135, 0.35)' },
  prune:      { ink: '#A0306E', soft: '#FBE8F2', glow: 'rgba(190, 60, 130, 0.35)' },
};

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  tone: NavTone;
  freeOnly?: boolean;
  hiddenForFree?: boolean;
  premiumOnly?: boolean;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [{ label: 'Accueil', path: '/app/dashboard', icon: Home, tone: 'prusse' }],
  },
  {
    title: 'Étudier',
    items: [
      { label: 'Catalogue de cours', path: '/app/catalogue', icon: Library, tone: 'lagune', freeOnly: true },
      { label: 'Études guidées', path: '/app/etude', icon: BookOpenText, tone: 'surligneur', hiddenForFree: true },
      { label: 'Révisions', path: '/app/revisions', icon: Layers, tone: 'sauge' },
      { label: 'Examens', path: '/app/examen', icon: GraduationCap, tone: 'garance' },
      { label: 'Rédaction', path: '/app/redaction', icon: PenLine, tone: 'encre', premiumOnly: true },
    ],
  },
  {
    title: 'Organiser',
    items: [
      { label: 'Mes matières', path: '/app/matieres', icon: FolderOpen, tone: 'ocre', premiumOnly: true },
      { label: 'Mes documents', path: '/app/bibliotheque', icon: FileText, tone: 'prusse', premiumOnly: true },
      { label: 'Objectifs', path: '/app/objectifs', icon: Target, tone: 'prune', premiumOnly: true },
      { label: 'Progression', path: '/app/progression', icon: LineChart, tone: 'lagune' },
    ],
  },
];

export function visibleItems(items: NavItem[], premium: boolean): NavItem[] {
  return items.filter((item) => !(item.freeOnly && premium) && !(item.hiddenForFree && !premium));
}

/** Les 4 destinations de la barre d'onglets mobile (la 5e est « Menu »). */
export function mobileTabs(premium: boolean): NavItem[] {
  const study: NavItem = premium
    ? { label: 'Étudier', path: '/app/etude', icon: BookOpenText, tone: 'surligneur' }
    : { label: 'Catalogue', path: '/app/catalogue', icon: Library, tone: 'lagune' };
  return [
    { label: 'Accueil', path: '/app/dashboard', icon: Home, tone: 'prusse' },
    study,
    { label: 'Réviser', path: '/app/revisions', icon: Layers, tone: 'sauge' },
    { label: 'Examens', path: '/app/examen', icon: GraduationCap, tone: 'garance' },
  ];
}
