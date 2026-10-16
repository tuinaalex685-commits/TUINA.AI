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
export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
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
    items: [{ label: 'Accueil', path: '/app/dashboard', icon: Home }],
  },
  {
    title: 'Étudier',
    items: [
      { label: 'Catalogue de cours', path: '/app/catalogue', icon: Library, freeOnly: true },
      { label: 'Études guidées', path: '/app/etude', icon: BookOpenText, hiddenForFree: true },
      { label: 'Révisions', path: '/app/revisions', icon: Layers },
      { label: 'Examens', path: '/app/examen', icon: GraduationCap },
      { label: 'Rédaction', path: '/app/redaction', icon: PenLine, premiumOnly: true },
    ],
  },
  {
    title: 'Organiser',
    items: [
      { label: 'Mes matières', path: '/app/matieres', icon: FolderOpen, premiumOnly: true },
      { label: 'Mes documents', path: '/app/bibliotheque', icon: FileText, premiumOnly: true },
      { label: 'Objectifs', path: '/app/objectifs', icon: Target, premiumOnly: true },
      { label: 'Progression', path: '/app/progression', icon: LineChart },
    ],
  },
];

export function visibleItems(items: NavItem[], premium: boolean): NavItem[] {
  return items.filter((item) => !(item.freeOnly && premium) && !(item.hiddenForFree && !premium));
}

/** Les 4 destinations de la barre d'onglets mobile (la 5e est « Menu »). */
export function mobileTabs(premium: boolean): NavItem[] {
  const study: NavItem = premium
    ? { label: 'Étudier', path: '/app/etude', icon: BookOpenText }
    : { label: 'Catalogue', path: '/app/catalogue', icon: Library };
  return [
    { label: 'Accueil', path: '/app/dashboard', icon: Home },
    study,
    { label: 'Réviser', path: '/app/revisions', icon: Layers },
    { label: 'Examens', path: '/app/examen', icon: GraduationCap },
  ];
}
