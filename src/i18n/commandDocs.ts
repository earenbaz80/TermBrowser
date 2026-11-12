import type { Locale } from './locales';
import type { CommandDoc } from '../data/commandDocs';

/**
 * Traducciones de las fichas de `COMMAND_DOCS`. El español vive en
 * `src/data/commandDocs.ts` y es la referencia: aquí solo se listan los demás
 * idiomas, con las descripciones de ejemplo en el mismo orden que el original.
 */
export interface CommandDocText {
  summary: string;
  description: string;
  examples: string[];
}

const de: Record<string, CommandDocText> = {
  'ir a / goto': {
    summary: 'Navigiert über natürliche spanische Syntax oder den klassischen Befehl zu jeder Webseite.',
    description:
      'Ersetzt die klassische Adressleiste. Holt Webinhalt, Absätze, navigierbare Links und echte Bilder der Seite direkt in die Konsole mit Retro-Rahmen und synchronisiert mit dem Web-Viewer.',
    examples: [
      'Hacker-News-Portal mit Terminal-Ansicht und Bildern öffnen',
      'Wikipedia mit echten Fotos abrufen',
      'Schnelle direkte Navigation',
    ],
  },
  'home / inicio': {
    summary: 'Kehrt zur Startseite des aktiven Tabs zurück.',
    description:
      'Stellt die Ausgangsumgebung des Tabs wieder her, um neue Suchen oder Befehle auszuführen.',
    examples: ['Zur Hauptseite des Browsers zurückkehren', 'Spanischer Alias für den Start'],
  },
  'pestaña / pestana': {
    summary: 'Direkte Tab-Verwaltung mit spanischen Befehlen (wechseln, erstellen, schließen).',
    description:
      'Wechselt numerisch zwischen Tabs (z. B. pestaña 1, pestaña 2), öffnet einen neuen Tab oder schließt den aktuellen.',
    examples: [
      'Zum Tab Nummer 1 wechseln',
      'Zum Tab Nummer 2 wechseln',
      'Neuen Tab erstellen und aktivieren',
      'Aktiven Tab schließen',
    ],
  },
  'lynx / web': {
    summary: 'Zeigt Webseiten in der Konsole wie in MS-DOS, inklusive Galerie echter Fotos.',
    description:
      'Renderer im Arachne-/Lynx-Stil für DOS, der echte Bilder, Überschriften und klickbare Links in die Kommandozeile holt.',
    examples: [
      'Artikel mit echten historischen Fotos im Terminal rendern',
      'Schnelles Surfen in der Konsole',
    ],
  },
  search: {
    summary: 'Sucht im Web über Terminus Search.',
    description:
      'Fragt DuckDuckGo und Wikipedia ab und zeigt die Ergebnisse in Terminus Search, der internen Suchseite des Browsers, mit Verlauf und Leseansicht im Tab.',
    examples: ['Dokumentation zu moderner Kryptografie suchen', 'Kurzleitfäden für Konsolenbefehle suchen'],
  },
  curl: {
    summary: 'Prüft echte HTTP-Anfragen mit Headern, Latenz und Statuscode.',
    description:
      'Sendet HTTP-Anfragen über den Backend- oder Browser-Proxy, um CORS-Blockaden zu vermeiden. Liefert Server-Header, Größe in Bytes und formatierten Body.',
    examples: ['Einen REST-Endpunkt testen und HTTP-Header prüfen', 'Eine strukturierte JSON-Ressource abrufen'],
  },
  reader: {
    summary: 'Aktiviert den sauberen, ablenkungsfreien Lesemodus.',
    description:
      'Entfernt Werbung, schwere Skripte und dekorative Stile, um den reinen lesbaren Text der aktuellen Seite zu zeigen.',
    examples: ['In die werbefreie Leseansicht im aktiven Tab wechseln'],
  },
  source: {
    summary: 'Prüft den HTML/DOM-Quelltext mit Zeilennummern.',
    description:
      'Zeigt den DOM-Baum und das Original-Markup der geladenen Website für Sicherheits- und Webentwicklungsanalysen.',
    examples: ['Den HTML-Quelltext der aktuellen Seite ansehen'],
  },
  tab: {
    summary: 'Vollständige Tab-Verwaltung per Befehl.',
    description:
      'Öffnet leere Tabs oder mit URL, schließt sie per ID oder wechselt schnell zwischen ihnen.',
    examples: [
      'Neuen Tab öffnen und zu Hacker News navigieren',
      'Fokus auf den zweiten geöffneten Tab setzen',
      'Alle offenen Tabs und ihren Status auflisten',
      'Aktiven Tab schließen',
    ],
  },
  bookmark: {
    summary: 'Speichert verschlüsselte Lesezeichen im lokalen AES-256-Tresor.',
    description:
      'Lesezeichen werden mit dem Hauptschlüssel geschützt gespeichert und können per Befehl abgefragt oder gelöscht werden.',
    examples: ['Ein Lesezeichen mit eigenem Titel speichern', 'Alle verschlüsselten Lesezeichen auflisten'],
  },
  'exit / salir': {
    summary: 'Prüft den Sitzungsstatus und zeigt Optionen zum Beenden.',
    description:
      'Informiert über die Integrität der verschlüsselten Sitzung und erinnert daran, dass Seite und Konsole dieselbe Textfläche teilen.',
    examples: ['Sitzungsstatus und Navigationsoptionen prüfen', 'Spanischer Alternativbefehl'],
  },
  history: {
    summary: 'Zeigt den persistenten Verlauf ausgeführter Befehle oder leert ihn.',
    description:
      'Jeder frühere Befehl lässt sich schnell mit Pfeil hoch (↑) und Pfeil runter (↓) abrufen. Der Verlauf bleibt über Sitzungen hinweg erhalten.',
    examples: ['Zuletzt ausgeführte Befehle auflisten', 'Persistenten Befehlsverlauf leeren'],
  },
  'top / ps': {
    summary: 'Öffnet das interaktive MS-DOS-Ressourcenboard.',
    description:
      'Zeigt ASCII-Balken für CPU, RAM, laufende Threads, Netzwerkleistung sowie visuelle und akustische Warnungen bei Anomalien.',
    examples: ['Interaktiven MS-DOS-Ressourcenmonitor öffnen', 'Liste der Prozesse und laufenden Aufgaben prüfen'],
  },
  python: {
    summary: 'Führt Python-Code und -Skripte in Echtzeit im Browser aus.',
    description:
      'Isolierte Laufzeitumgebung mit Datenstrukturen, Mathematik, Funktionen, for/while-Schleifen und JSON-Verarbeitung.',
    examples: [
      'Liste der Quadrate mit List Comprehension erzeugen',
      'Operationen mit der Mathematik-Bibliothek',
      'Dictionaries und JSON-Objekte bearbeiten',
    ],
  },
  bash: {
    summary: 'Führt Shell-Befehlsfolgen mit Verkettung aus.',
    description: 'Führt mehrere Anweisungen aus, die mit `&&` oder `;` verkettet sind.',
    examples: ['Benutzeridentität und Datum/Uhrzeit abfragen', 'Meldung und Sicherheitsabfrage verketten'],
  },
  'shell nativo': {
    summary: 'Führt echte Systembefehle aus der Desktop-App aus.',
    description:
      'In der Electron-App sendet der SHELL-Selektor echte Befehle an CMD, Windows PowerShell, PowerShell Core oder Bash (Git Bash unter Windows, WSL als Alternative, System-Bash unter Linux/macOS). Das Arbeitsverzeichnis ist real und bleibt pro Tab erhalten: "cd C:\\Users" wechselt auf die lokale Platte, "cd .." eine Ebene höher und "cd ~" zurück ins Benutzerverzeichnis. Prozesse laufen mit den Rechten des Benutzers. Bei einer nativen Shell nutzt das Terminal ein echtes PTY: vim, ssh, top und andere Vollbildprogramme funktionieren mit Tastatur, Farben und Ctrl+C; der nicht-interaktive Modus behält das Limit von 120 Sekunden und 1 MB Ausgabe. Viele dieser Werkzeuge fehlen unter Windows: siehe die Karte "PTY interactivo" zur Installation. In der Web-Version bleibt der Selektor auf TERMINUS, weil der Browser keine lokalen Prozesse starten kann.',
    examples: [
      'Echte Windows-Dateien durchsuchen und auflisten',
      'Echte Prozesse mit PowerShell auflisten',
      'Das System aus Git Bash, WSL oder Linux abfragen',
    ],
  },
  'PTY interactivo': {
    summary: 'Führt Vollbildprogramme und echte interaktive Sitzungen aus.',
    description:
      'In der Desktop-App aktiviert CMD, PowerShell oder Bash ein echtes PTY: Vollbildprogramme erhalten Tastatur, Farben und Signale wie Ctrl+C. Terminus bringt diese Werkzeuge nicht mit; sie müssen im PATH der gewählten Shell liegen. Unter Windows: vim installiert man mit "winget install vim.vim" (oder es kommt mit Git Bash); ssh über das optionale Feature OpenSSH Client (Einstellungen > Apps > Optionale Features) oder "winget install Microsoft.OpenSSH.Preview"; top und htop gibt es unter Windows nicht, daher WSL ("wsl --install" und dann "wsl top") oder htop in der Distribution installieren ("sudo apt install htop"). Unter macOS und Linux sind sie meist vorinstalliert. Der Befehl top im emulierten Modus (ohne native Shell) öffnet den internen CPU/RAM-Monitor, nicht das System-top.',
    examples: [
      'Vim unter Windows mit winget installieren',
      'OpenSSH-Client mit winget installieren',
      'WSL und eine Linux-Distribution installieren (Neustart nötig)',
      'htop in der WSL-Distribution installieren',
      'vim ohne Konfiguration öffnen; mit :q! beenden',
      'Interaktive SSH-Sitzung (OpenSSH-Client nötig)',
      'Linux-Prozesse von Windows aus mit WSL ansehen',
    ],
  },
  'ls / dir': {
    summary: 'Listet Dateien des lokalen Workspace oder der virtuellen Platte.',
    description:
      'Das Terminal startet in /workspace, der echten lokalen Platte. Mit `cd /home/user` geht es zurück ins virtuelle Demo-System. `dir` imitiert die klassische MS-DOS-Ausgabe mit Datum, Uhrzeit und Größe in Bytes.',
    examples: [
      'Dateien des aktuellen Verzeichnisses im Unix-Format auflisten',
      'Dateien im Format von MS-DOS 6.22 auflisten',
    ],
  },
  'cat / type': {
    summary: 'Zeigt den Inhalt einer lokalen oder virtuellen Datei.',
    description: 'Liest Konfigurationsdateien, Automatisierungsskripte oder Klartext-Logs.',
    examples: [
      'Die Willkommensanleitung des Systems lesen',
      'Ein Python-Testskript prüfen',
      'Eine Konfigurationsdatei im MS-DOS-Stil lesen',
    ],
  },
  whoami: {
    summary: 'Zeigt die aktive Sitzungsidentität und Verschlüsselungsrechte.',
    description:
      'Gibt aktuellen Benutzer, Zugriffsstufe des Terminals und Status der Zwei-Faktor-Verifizierung aus.',
    examples: ['Aktuelle Sicherheitsstufe und Berechtigungen prüfen'],
  },
  'clear / cls': {
    summary: 'Leert Bildschirm und Ausgabepuffer des Terminals.',
    description: 'Löscht den sichtbaren Konsolenverlauf für eine saubere Arbeitsfläche.',
    examples: ['Terminalpuffer leeren (Tastenkürzel: Ctrl+L)'],
  },
  'voice / voz / dictar': {
    summary: 'Spracheingabe und Diktat über die Web Speech API (Tastenkürzel: Ctrl+M).',
    description:
      'Diktiert Befehle in natürlicher Sprache (z. B. "inicio", "ir a wikipedia", "listar archivos", "pestaña 1") und transkribiert Websuchen mit VU-Meter und phosphoreszierendem CRT-Text.',
    examples: ['Status der Spracherkennung und erkannte Befehle prüfen', 'Spanischer Alias für die Sprachsteuerung'],
  },
  ping: {
    summary: 'Diagnostiziert Latenz und Qualität der Verbindung zu einem Server.',
    description:
      'Berechnet Round-Trip-Zeiten (RTT) in Millisekunden, Schwankung (Jitter) und Paketverlust.',
    examples: ['Antwortzeit mit Cloudflare-DNS messen', 'Konnektivität zu Google prüfen'],
  },
  dns: {
    summary: 'Löst DNS-Einträge (A, AAAA, MX) für jede Domain auf.',
    description:
      'Fragt globale Nameserver über die Server-API ab und liefert die zugehörigen IP-Adressen.',
    examples: ['IPv4- und IPv6-Einträge von google.com abfragen', 'Adressen der GitHub-Server auflösen'],
  },
  speedtest: {
    summary: 'Misst Bandbreite und Latenz des Netzwerks.',
    description:
      'Bewertet Downloadrate, Uploadrate über den AES-256-Tunnel und Verbindungsstabilität.',
    examples: ['Vollständigen Throughput- und Latenztest starten'],
  },
  'ipconfig / ifconfig': {
    summary: 'Zeigt Konfiguration der Netzwerkadapter und des sicheren Tunnels.',
    description:
      'Detailliert IPv4, IPv6, Gateway, DNS und den Status der AES-256-Hardwareverschlüsselung der Schnittstelle.',
    examples: ['Netzwerkkonfiguration und verschlüsselten Tunnel ansehen'],
  },
  scrape: {
    summary: 'Extrahiert Metadaten, Links und Ressourcen einer Webseite.',
    description:
      'Analysiert das DOM des Ziels und listet Überschriften, externe Links und strukturierte Bilder.',
    examples: [
      'Links und Metadaten von Hacker News extrahieren',
      'Daten der im aktiven Tab geladenen Seite extrahieren',
    ],
  },
  vault: {
    summary: 'Verwaltet den lokalen Tresor mit AES-256-GCM-Verschlüsselung.',
    description:
      'Prüft die SHA-256-Prüfsumme der Daten und sperrt oder entsperrt mit dem Hauptschlüssel.',
    examples: [
      'Status von AES-256 und Prüfsumme prüfen',
      'Den Zugangsdaten-Tresor sofort sperren',
      'Den Tresor mit dem Hauptschlüssel entsperren',
    ],
  },
  mfa: {
    summary: 'Verwaltet die TOTP-Mehrfaktor-Authentifizierung (RFC 6238).',
    description:
      'Erzeugt 6-stellige Zeittokens mit 30-Sekunden-Fenster, kompatibel mit Google Authenticator oder Authy.',
    examples: [
      'Status der Zwei-Faktor-Authentifizierung und aktives Token prüfen',
      'Einen 6-stelligen Bestätigungscode validieren',
    ],
  },
  sync: {
    summary: 'Synchronisiert den verschlüsselten Workspace mit der sicheren Cloud.',
    description:
      'Erstellt einen AES-256-verschlüsselten Dump aller Tabs, Skripte und Lesezeichen; die Wiederherstellung verlangt MFA.',
    examples: [
      'Backup verschlüsseln und in die Terminus-Cloud hochladen',
      'Backup aus der Cloud laden und wiederherstellen',
    ],
  },
  hash: {
    summary: 'Berechnet sofort SHA-256-Prüfsummen.',
    description: 'Erzeugt den kryptografischen Fingerabdruck über die native Web Crypto API.',
    examples: ['SHA-256-Hash eines Textes erzeugen'],
  },
  base64: {
    summary: 'Kodiert oder dekodiert Zeichenketten im Base64-Format.',
    description: 'Nützlich für Binärlasten, Authentifizierungstoken oder Geheimnisse.',
    examples: ['Text nach Base64 kodieren', 'Base64-Zeichenkette dekodieren'],
  },
  script: {
    summary: 'Verwaltet und führt automatisierte Abläufe und Makros aus.',
    description:
      'Führt Befehlsketten geordnet mit Schritt-für-Schritt-Protokoll aus, um wiederkehrende Aufgaben zu automatisieren.',
    examples: [
      'Liste der verfügbaren Automatisierungsskripte anzeigen',
      'Vollständigen System-Audit-Ablauf ausführen',
      'Makro ausführen, das News öffnet und den Lesemodus aktiviert',
    ],
  },
  binds: {
    summary: 'Öffnet das interaktive Panel für anpassbare Tastenkürzel.',
    description:
      'Konfiguriert Schnelltasten (z. B. Ctrl+T, Ctrl+W, Ctrl+B, Ctrl+M, Ctrl+L) für beliebige Befehle.',
    examples: ['Tastenkürzel-Manager öffnen'],
  },
  ext: {
    summary: 'Verwaltet Konsolen-Erweiterungen und Drittanbieter-Plugins.',
    description:
      'Erlaubt es, den CLI-Erweiterungskatalog anzusehen, Erweiterungen zu aktivieren oder in die Konsole einzubinden.',
    examples: ['Katalog der verfügbaren Erweiterungen öffnen', 'Erweiterung zur Web-Extraktion aktivieren'],
  },
  log: {
    summary: 'Exportiert Audit- und Aktivitätsprotokolle des Systems.',
    description:
      'Lädt strukturierte JSON- oder Textdateien (.txt) mit allen protokollierten Aktionen herunter.',
    examples: ['Vollständiges Audit als JSON herunterladen', 'Logs als Textdatei herunterladen'],
  },
  // @de-more
};

const fr: Record<string, CommandDocText> = {
  'ir a / goto': {
    summary:
      'Navigue vers n’importe quelle page web via une syntaxe naturelle en espagnol ou la commande classique.',
    description:
      'Remplace la barre d’adresse classique. Extrait le contenu web, les paragraphes, les liens navigables et les vraies images du site directement dans la console avec des cadres rétro, et synchronise avec le visualiseur web.',
    examples: [
      'Ouvrir le portail Hacker News avec vue terminal et images',
      'Consulter Wikipédia avec de vraies photos',
      'Navigation directe rapide',
    ],
  },
  'home / inicio': {
    summary: 'Revient à l’écran d’accueil de l’onglet actif.',
    description:
      'Restaure l’environnement initial de l’onglet pour lancer de nouvelles recherches ou commandes.',
    examples: ['Revenir à la page principale du navigateur', 'Alias espagnol pour revenir à l’accueil'],
  },
  'pestaña / pestana': {
    summary: 'Gestion directe des onglets en espagnol (changer, créer, fermer).',
    description:
      'Permet de passer d’un onglet à l’autre numériquement (ex. pestaña 1, pestaña 2), d’ouvrir un nouvel onglet ou de fermer l’actuel.',
    examples: [
      'Passer à l’onglet numéro 1',
      'Passer à l’onglet numéro 2',
      'Créer et activer un nouvel onglet',
      'Fermer l’onglet actif',
    ],
  },
  'lynx / web': {
    summary: 'Affiche des sites dans la console comme sous MS-DOS, avec galerie de vraies photos.',
    description:
      'Moteur de rendu façon Arachne / Lynx pour DOS qui extrait de vraies images, titres et liens cliquables dans la ligne de commande.',
    examples: [
      'Afficher un article avec de vraies photos historiques dans le terminal',
      'Navigation web rapide en console',
    ],
  },
  search: {
    summary: 'Recherche sur le web depuis Terminus Search.',
    description:
      'Interroge DuckDuckGo et Wikipédia et présente les résultats dans Terminus Search, la page de recherche interne du navigateur, avec historique et vue lecture dans l’onglet.',
    examples: [
      'Chercher de la documentation sur la cryptographie moderne',
      'Chercher des aide-mémoire de commandes console',
    ],
  },
  curl: {
    summary: 'Inspecte de vraies requêtes HTTP avec en-têtes, latence et code de statut.',
    description:
      'Envoie des requêtes HTTP via le proxy du backend ou du navigateur pour éviter les blocages CORS. Renvoie les en-têtes du serveur, la taille en octets et le corps formaté.',
    examples: [
      'Tester un point de terminaison REST et examiner les en-têtes HTTP',
      'Récupérer une ressource JSON structurée',
    ],
  },
  reader: {
    summary: 'Active le mode lecture propre et sans distractions.',
    description:
      'Supprime la publicité, les scripts lourds et les styles décoratifs pour afficher le texte brut lisible de la page actuelle.',
    examples: ['Basculer vers la vue lecture sans publicité dans l’onglet actif'],
  },
  source: {
    summary: 'Inspecte le code source HTML/DOM avec numérotation des lignes.',
    description:
      'Affiche l’arbre DOM et le balisage d’origine du site chargé pour l’analyse de sécurité et le développement web.',
    examples: ['Voir le code source HTML de la page actuelle'],
  },
  tab: {
    summary: 'Gestion complète des onglets de navigation par commande.',
    description:
      'Permet d’ouvrir des onglets vides ou avec URL, de les fermer par ID ou de passer rapidement de l’un à l’autre.',
    examples: [
      'Ouvrir un nouvel onglet vers Hacker News',
      'Donner le focus au deuxième onglet ouvert',
      'Lister tous les onglets ouverts et leur état',
      'Fermer l’onglet actif',
    ],
  },
  bookmark: {
    summary: 'Enregistre des favoris chiffrés dans le coffre AES-256 local.',
    description:
      'Les favoris sont stockés protégés par la clé maîtresse et peuvent être consultés ou supprimés par commande.',
    examples: ['Enregistrer un favori avec un titre personnalisé', 'Lister tous les favoris chiffrés'],
  },
  'exit / salir': {
    summary: 'Vérifie l’état de la session et affiche les options de sortie.',
    description:
      'Renseigne sur l’intégrité de la session chiffrée et rappelle que la page et la console partagent une seule surface de texte.',
    examples: ['Vérifier l’état de session et les options de navigation', 'Commande alternative en espagnol'],
  },
  history: {
    summary: 'Affiche l’historique persistant des commandes exécutées ou le vide.',
    description:
      'Permet de rappeler rapidement n’importe quelle commande avec les flèches haut (↑) et bas (↓). L’historique est conservé entre les sessions.',
    examples: ['Lister les commandes exécutées récemment', 'Vider l’historique persistant des commandes'],
  },
  'top / ps': {
    summary: 'Déploie le tableau de bord interactif de ressources façon MS-DOS.',
    description:
      'Affiche des jauges ASCII pour le CPU, la RAM, les threads actifs, les performances réseau et des alertes visuelles et sonores en cas d’anomalie.',
    examples: ['Ouvrir le moniteur de ressources interactif MS-DOS', 'Inspecter la liste des processus et tâches en cours'],
  },
  python: {
    summary: 'Exécute du code et des scripts Python en temps réel dans le navigateur.',
    description:
      'Environnement d’exécution isolé avec structures de données, opérations mathématiques, fonctions, boucles for/while et gestion du JSON.',
    examples: [
      'Générer une liste de carrés avec une list comprehension',
      'Opérations avec la bibliothèque mathématique',
      'Manipuler des dictionnaires et objets JSON',
    ],
  },
  bash: {
    summary: 'Exécute des séquences de commandes shell avec chaînage.',
    description: 'Permet d’exécuter plusieurs directives chaînées avec `&&` ou `;`.',
    examples: ['Consulter l’identité utilisateur et la date/l’heure', 'Chaîner un message et une requête de sécurité'],
  },
  'shell nativo': {
    summary: 'Exécute de vraies commandes système depuis l’application de bureau.',
    description:
      'Dans l’application Electron, le sélecteur SHELL envoie de vraies commandes à CMD, Windows PowerShell, PowerShell Core ou Bash (Git Bash sous Windows, WSL en alternative, le Bash système sous Linux/macOS). Le répertoire de travail est réel et persiste par onglet : « cd C:\\Users » entre dans le disque local, « cd .. » remonte d’un niveau et « cd ~ » revient au dossier de l’utilisateur. Les processus utilisent les droits de l’utilisateur. Avec un shell natif, le terminal utilise un vrai PTY : vim, ssh, top et autres applications plein écran fonctionnent avec clavier, couleurs et Ctrl+C ; le mode non interactif conserve la limite de 120 secondes et 1 Mo de sortie. Beaucoup de ces outils n’existent pas sous Windows : voir la fiche « PTY interactivo » pour les installer. Dans la version web, le sélecteur reste sur TERMINUS car le navigateur ne peut pas lancer de processus locaux.',
    examples: [
      'Parcourir et lister de vrais fichiers Windows',
      'Lister les processus réels avec PowerShell',
      'Consulter le système depuis Git Bash, WSL ou Linux',
    ],
  },
  'PTY interactivo': {
    summary: 'Exécute des programmes plein écran et de vraies sessions interactives.',
    description:
      'Dans l’application de bureau, choisir CMD, PowerShell ou Bash active un vrai PTY : les programmes plein écran reçoivent le clavier, les couleurs et les signaux comme Ctrl+C. Terminus ne fournit pas ces outils ; ils doivent exister dans le PATH du shell choisi. Sous Windows : vim s’installe avec « winget install vim.vim » (ou vient avec Git Bash) ; ssh via la fonctionnalité facultative OpenSSH Client (Paramètres > Applications > Fonctionnalités facultatives) ou « winget install Microsoft.OpenSSH.Preview » ; top et htop n’existent pas sous Windows, utilisez donc WSL (« wsl --install » puis « wsl top ») ou installez htop dans la distribution (« sudo apt install htop »). Sous macOS et Linux, ils sont généralement préinstallés. La commande top du mode émulé (sans shell natif) ouvre le moniteur interne CPU/RAM, pas le top du système.',
    examples: [
      'Installer Vim sous Windows avec winget',
      'Installer le client OpenSSH avec winget',
      'Installer WSL et une distribution Linux (redémarrage requis)',
      'Installer htop dans la distribution WSL',
      'Ouvrir vim sans configuration ; quitter avec :q!',
      'Session SSH interactive (client OpenSSH requis)',
      'Voir les processus Linux depuis Windows avec WSL',
    ],
  },
  'ls / dir': {
    summary: 'Liste les fichiers de l’espace de travail local ou du disque virtuel.',
    description:
      'Le terminal démarre dans /workspace, le disque local réel. Utilisez `cd /home/user` pour revenir au système virtuel de démonstration. `dir` imite la sortie classique de MS-DOS avec dates, heures et tailles en octets.',
    examples: [
      'Lister les fichiers du dossier courant au format Unix',
      'Lister les fichiers au format MS-DOS 6.22',
    ],
  },
  'cat / type': {
    summary: 'Affiche le contenu d’un fichier local ou virtuel.',
    description:
      'Lit les fichiers de configuration, les scripts d’automatisation ou les journaux en texte brut.',
    examples: [
      'Lire le manuel de bienvenue du système',
      'Inspecter un script Python de test',
      'Lire un fichier de configuration à la manière MS-DOS',
    ],
  },
  whoami: {
    summary: 'Affiche l’identité de session active et les privilèges de chiffrement.',
    description:
      'Imprime l’utilisateur courant, le niveau d’accès du terminal et l’état de la vérification à deux facteurs.',
    examples: ['Consulter le niveau de sécurité et les permissions actuelles'],
  },
  'clear / cls': {
    summary: 'Efface l’écran et le tampon de sortie du terminal.',
    description: 'Efface l’historique visible de la console pour garder un espace de travail propre.',
    examples: ['Effacer le tampon du terminal (raccourci : Ctrl+L)'],
  },
  'voice / voz / dictar': {
    summary: 'Saisie et dictée vocales via Web Speech API (raccourci : Ctrl+M).',
    description:
      'Permet de dicter des commandes en langage naturel (ex. « inicio », « ir a wikipedia », « listar archivos », « pestaña 1 ») et de transcrire des recherches web avec VU-mètre et texte phosphorescent style CRT.',
    examples: ['Consulter l’état du moteur vocal et les commandes reconnues', 'Alias espagnol pour la commande vocale'],
  },
  ping: {
    summary: 'Diagnostique la latence et la qualité de la connexion à un serveur.',
    description:
      'Calcule les temps aller-retour (RTT) en millisecondes, la variabilité (gigue) et la perte de paquets.',
    examples: ['Mesurer le temps de réponse du DNS Cloudflare', 'Vérifier la connectivité vers Google'],
  },
  dns: {
    summary: 'Résout les enregistrements DNS (A, AAAA, MX) de n’importe quel domaine.',
    description:
      'Interroge les serveurs de noms mondiaux via l’API du serveur et renvoie les adresses IP associées.',
    examples: [
      'Consulter les enregistrements IPv4 et IPv6 de google.com',
      'Résoudre les adresses des serveurs GitHub',
    ],
  },
  speedtest: {
    summary: 'Mesure le débit et la latence du réseau.',
    description:
      'Évalue le débit descendant, le débit montant sous tunnel AES-256 et la stabilité de la connexion.',
    examples: ['Lancer un test complet de débit et de latence'],
  },
  'ipconfig / ifconfig': {
    summary: 'Affiche la configuration des adaptateurs réseau et du tunnel sécurisé.',
    description:
      'Détaille IPv4, IPv6, passerelle, DNS et l’état du chiffrement matériel AES-256 de l’interface.',
    examples: ['Voir la configuration réseau et le tunnel chiffré'],
  },
  scrape: {
    summary: 'Extrait les métadonnées, liens et ressources d’une page web.',
    description:
      'Analyse le DOM de la cible pour lister les titres, liens externes et images structurées.',
    examples: [
      'Extraire les liens et métadonnées de Hacker News',
      'Extraire les données de la page chargée dans l’onglet actif',
    ],
  },
  vault: {
    summary: 'Gère le coffre local protégé par chiffrement AES-256-GCM.',
    description:
      'Permet de vérifier la somme SHA-256 d’intégrité des données, de verrouiller ou déverrouiller avec la clé maîtresse.',
    examples: [
      'Vérifier l’état du chiffrement AES-256 et la somme de contrôle',
      'Verrouiller immédiatement le coffre d’identifiants',
      'Déverrouiller le coffre avec la clé maîtresse',
    ],
  },
  mfa: {
    summary: 'Administre l’authentification multifacteur TOTP (RFC 6238).',
    description:
      'Génère des jetons temporaires à 6 chiffres avec une fenêtre de 30 secondes, compatibles avec Google Authenticator ou Authy.',
    examples: [
      'Vérifier l’état de la double authentification et le jeton actif',
      'Valider un code de vérification à 6 chiffres',
    ],
  },
  sync: {
    summary: 'Synchronise l’espace de travail chiffré avec le cloud sécurisé.',
    description:
      'Réalise un export chiffré AES-256 de tous les onglets, scripts et favoris, avec validation MFA à la restauration.',
    examples: [
      'Chiffrer et envoyer une sauvegarde dans le cloud Terminus',
      'Télécharger et restaurer une sauvegarde depuis le cloud',
    ],
  },
  hash: {
    summary: 'Calcule des sommes cryptographiques SHA-256 instantanées.',
    description: 'Génère l’empreinte cryptographique via la Web Crypto API native.',
    examples: ['Générer le hash SHA-256 d’un texte'],
  },
  base64: {
    summary: 'Encode ou décode des chaînes au format Base64.',
    description:
      'Utile pour transporter des charges binaires, des jetons d’authentification ou des secrets.',
    examples: ['Encoder un texte en Base64', 'Décoder une chaîne Base64'],
  },
  script: {
    summary: 'Administre et exécute des flux de travail et macros automatisés.',
    description:
      'Exécute des séquences de commandes de façon ordonnée avec des journaux étape par étape pour automatiser les tâches répétitives.',
    examples: [
      'Voir la liste des scripts d’automatisation disponibles',
      'Exécuter le flux complet d’audit du système',
      'Exécuter une macro qui ouvre les actualités et active le mode lecture',
    ],
  },
  binds: {
    summary: 'Ouvre le panneau interactif des raccourcis clavier personnalisables.',
    description:
      'Permet de configurer des raccourcis (ex. Ctrl+T, Ctrl+W, Ctrl+B, Ctrl+M, Ctrl+L) pour déclencher n’importe quelle commande.',
    examples: ['Ouvrir le gestionnaire de raccourcis clavier'],
  },
  ext: {
    summary: 'Gère les extensions de console et les plugins tiers.',
    description:
      'Permet de consulter le catalogue d’extensions CLI, de les activer ou de les intégrer à la console.',
    examples: ['Ouvrir le catalogue des extensions disponibles', 'Activer l’extension d’extraction web'],
  },
  log: {
    summary: 'Exporte les journaux d’audit et d’activité du système.',
    description:
      'Télécharge des fichiers structurés en JSON ou en texte brut (.txt) avec toutes les actions enregistrées.',
    examples: ['Télécharger l’audit complet en JSON', 'Télécharger les journaux en fichier texte'],
  },
  // @fr-more
};

const it: Record<string, CommandDocText> = {
  'ir a / goto': {
    summary:
      'Naviga verso qualsiasi pagina web con sintassi naturale in spagnolo o con il comando classico.',
    description:
      'Sostituisce la barra degli indirizzi tradizionale. Estrae contenuti web, paragrafi, link navigabili e immagini reali del sito direttamente nella console con cornici retrò, sincronizzandosi con il visualizzatore web.',
    examples: [
      'Aprire il portale Hacker News con vista terminale e immagini',
      'Consultare Wikipedia con foto reali',
      'Navigazione diretta rapida',
    ],
  },
  'home / inicio': {
    summary: 'Torna alla schermata iniziale della scheda attiva.',
    description:
      'Ripristina l’ambiente iniziale della scheda per eseguire nuove ricerche o comandi.',
    examples: ['Tornare alla pagina principale del browser', 'Alias spagnolo per tornare all’inizio'],
  },
  'pestaña / pestana': {
    summary: 'Gestione diretta delle schede in spagnolo (cambia, crea, chiudi).',
    description:
      'Consente di passare tra le schede numericamente (es. pestaña 1, pestaña 2), aprire una nuova scheda o chiudere quella attiva.',
    examples: [
      'Passare alla scheda numero 1',
      'Passare alla scheda numero 2',
      'Creare e attivare una nuova scheda',
      'Chiudere la scheda attiva',
    ],
  },
  'lynx / web': {
    summary: 'Mostra siti web nella console come in MS-DOS, con galleria di foto reali.',
    description:
      'Motore di rendering in stile Arachne / Lynx per DOS che estrae immagini reali, intestazioni e link cliccabili nella riga di comando.',
    examples: [
      'Renderizzare un articolo con foto storiche reali nel terminale',
      'Navigazione web rapida in console',
    ],
  },
  search: {
    summary: 'Cerca sul web da Terminus Search.',
    description:
      'Interroga DuckDuckGo e Wikipedia e mostra i risultati in Terminus Search, la pagina di ricerca interna del browser, con cronologia e vista lettura nella scheda.',
    examples: [
      'Cercare documentazione sulla crittografia moderna',
      'Cercare guide rapide ai comandi della console',
    ],
  },
  curl: {
    summary: 'Ispeziona richieste HTTP reali con header, latenza e codice di stato.',
    description:
      'Invia richieste HTTP tramite il proxy del backend o del browser per evitare blocchi CORS. Restituisce header del server, dimensione in byte e corpo formattato.',
    examples: [
      'Testare un endpoint REST ed esaminare gli header HTTP',
      'Ottenere una risorsa JSON strutturata',
    ],
  },
  reader: {
    summary: 'Attiva la modalità lettura pulita e senza distrazioni.',
    description:
      'Rimuove pubblicità, script pesanti e stili decorativi per mostrare il testo puro e leggibile della pagina corrente.',
    examples: ['Passare alla vista lettura senza annunci nella scheda attiva'],
  },
  source: {
    summary: 'Ispeziona il codice sorgente HTML/DOM con numerazione delle righe.',
    description:
      'Mostra l’albero DOM e il markup originale del sito caricato per analisi di sicurezza e sviluppo web.',
    examples: ['Vedere il codice sorgente HTML della pagina corrente'],
  },
  tab: {
    summary: 'Gestione completa delle schede di navigazione da comando.',
    description:
      'Permette di aprire schede vuote o con URL, chiuderle per ID o passare rapidamente da una all’altra.',
    examples: [
      'Aprire una nuova scheda su Hacker News',
      'Spostare il focus sulla seconda scheda aperta',
      'Elencare tutte le schede aperte e il loro stato',
      'Chiudere la scheda attiva',
    ],
  },
  bookmark: {
    summary: 'Salva segnalibri cifrati nella cassaforte AES-256 locale.',
    description:
      'I segnalibri sono memorizzati protetti dalla chiave maestra e possono essere consultati o eliminati tramite comandi.',
    examples: ['Salvare un segnalibro con titolo personalizzato', 'Elencare tutti i segnalibri cifrati'],
  },
  'exit / salir': {
    summary: 'Verifica lo stato della sessione e mostra le opzioni di uscita.',
    description:
      'Informa sull’integrità della sessione cifrata e ricorda che pagina e console condividono un’unica superficie di testo.',
    examples: ['Verificare stato sessione e opzioni di navigazione', 'Comando alternativo in spagnolo'],
  },
  history: {
    summary: 'Mostra la cronologia persistente dei comandi eseguiti o la svuota.',
    description:
      'Permette di richiamare rapidamente qualsiasi comando con freccia su (↑) e freccia giù (↓). La cronologia resta tra le sessioni.',
    examples: ['Elencare i comandi eseguiti di recente', 'Svuotare la cronologia persistente dei comandi'],
  },
  'top / ps': {
    summary: 'Apre il pannello interattivo di monitoraggio risorse in stile MS-DOS.',
    description:
      'Mostra barre ASCII per CPU, RAM, thread attivi, prestazioni di rete e avvisi visivi e sonori in caso di anomalie.',
    examples: ['Aprire il monitor risorse interattivo MS-DOS', 'Ispezionare l’elenco dei processi e delle attività'],
  },
  python: {
    summary: 'Esegue codice e script Python in tempo reale nel browser.',
    description:
      'Ambiente di esecuzione isolato con supporto a strutture dati, operazioni matematiche, funzioni, cicli for/while e gestione JSON.',
    examples: [
      'Generare una lista di quadrati con list comprehension',
      'Operazioni con la libreria matematica',
      'Manipolare dizionari e oggetti JSON',
    ],
  },
  bash: {
    summary: 'Esegue sequenze di comandi shell con concatenamento.',
    description: 'Consente di eseguire più direttive concatenate con `&&` o `;`.',
    examples: ['Consultare identità utente e data/ora', 'Concatenare messaggio e controllo di sicurezza'],
  },
  'shell nativo': {
    summary: 'Esegue comandi reali di sistema dall’app desktop.',
    description:
      'Nell’app Electron il selettore SHELL invia comandi reali a CMD, Windows PowerShell, PowerShell Core o Bash (Git Bash su Windows, WSL come alternativa, Bash di sistema su Linux/macOS). La directory di lavoro è reale e persiste per scheda: "cd C:\\Users" entra nel disco locale, "cd .." sale di un livello e "cd ~" torna alla cartella utente. I processi usano i permessi dell’utente. Con una shell nativa il terminale usa un PTY reale: vim, ssh, top e altre applicazioni a schermo intero funzionano con tastiera, colori e Ctrl+C; la modalità non interattiva mantiene il limite di 120 secondi e 1 MB di output. Molti di questi strumenti mancano su Windows: vedi la scheda "PTY interactivo" per installarli. Nella versione web il selettore resta su TERMINUS perché il browser non può avviare processi locali.',
    examples: [
      'Esplorare ed elencare file reali di Windows',
      'Elencare processi reali con PowerShell',
      'Consultare il sistema da Git Bash, WSL o Linux',
    ],
  },
  'PTY interactivo': {
    summary: 'Esegue programmi a schermo intero e vere sessioni interattive.',
    description:
      'Nell’app desktop scegliere CMD, PowerShell o Bash attiva un PTY reale: i programmi a schermo intero ricevono tastiera, colori e segnali come Ctrl+C. Terminus non include questi strumenti; devono esistere nel PATH della shell scelta. Su Windows: vim si installa con "winget install vim.vim" (o arriva con Git Bash); ssh con la funzione opzionale OpenSSH Client (Impostazioni > App > Funzionalità opzionali) o "winget install Microsoft.OpenSSH.Preview"; top e htop non esistono su Windows, quindi usa WSL ("wsl --install" e poi "wsl top") o installa htop nella distro ("sudo apt install htop"). Su macOS e Linux sono di solito preinstallati. Il comando top della modalità emulata (senza shell nativa) apre il monitor interno CPU/RAM, non il top di sistema.',
    examples: [
      'Installare Vim su Windows con winget',
      'Installare il client OpenSSH con winget',
      'Installare WSL e una distro Linux (richiede riavvio)',
      'Installare htop nella distro WSL',
      'Aprire vim senza configurazione; uscire con :q!',
      'Sessione SSH interattiva (serve il client OpenSSH)',
      'Vedere i processi Linux da Windows con WSL',
    ],
  },
  'ls / dir': {
    summary: 'Elenca i file del workspace locale o del disco virtuale.',
    description:
      'Il terminale parte in /workspace, il disco locale reale. Usa `cd /home/user` per tornare al sistema virtuale dimostrativo. `dir` imita l’output classico di MS-DOS con date, orari e dimensioni in byte.',
    examples: [
      'Elencare i file della directory corrente in formato Unix',
      'Elencare i file nel formato di MS-DOS 6.22',
    ],
  },
  'cat / type': {
    summary: 'Mostra il contenuto di un file locale o virtuale.',
    description: 'Legge file di configurazione, script di automazione o log in testo semplice.',
    examples: [
      'Leggere il manuale di benvenuto del sistema',
      'Ispezionare uno script Python di prova',
      'Leggere un file di configurazione in stile MS-DOS',
    ],
  },
  whoami: {
    summary: 'Mostra l’identità di sessione attiva e i privilegi di cifratura.',
    description:
      'Stampa utente corrente, livello di accesso del terminale e stato della verifica a due fattori.',
    examples: ['Consultare livello di sicurezza e permessi attuali'],
  },
  'clear / cls': {
    summary: 'Pulisce schermo e buffer di output del terminale.',
    description:
      'Cancella la cronologia visibile della console per mantenere uno spazio di lavoro pulito.',
    examples: ['Pulire il buffer del terminale (scorciatoia: Ctrl+L)'],
  },
  'voice / voz / dictar': {
    summary: 'Input e dettatura vocale tramite Web Speech API (scorciatoia: Ctrl+M).',
    description:
      'Consente di dettare comandi in linguaggio naturale (es. "inicio", "ir a wikipedia", "listar archivos", "pestaña 1") e di trascrivere ricerche web con VU meter e testo fosforescente stile CRT.',
    examples: ['Consultare stato del motore vocale e comandi riconosciuti', 'Alias spagnolo per il supporto vocale'],
  },
  ping: {
    summary: 'Diagnostica latenza e qualità della connessione con un server.',
    description:
      'Calcola tempi di andata e ritorno (RTT) in millisecondi, variabilità (jitter) e perdita di pacchetti.',
    examples: ['Misurare il tempo di risposta con il DNS Cloudflare', 'Verificare la connettività verso Google'],
  },
  dns: {
    summary: 'Risolve record DNS (A, AAAA, MX) per qualsiasi dominio.',
    description:
      'Interroga i name server globali tramite l’API del server e restituisce gli indirizzi IP associati.',
    examples: [
      'Consultare i record IPv4 e IPv6 di google.com',
      'Risolvere gli indirizzi dei server GitHub',
    ],
  },
  speedtest: {
    summary: 'Misura prestazioni di banda e latenza della rete.',
    description:
      'Valuta velocità di download, upload sotto tunnel AES-256 e stabilità della connessione.',
    examples: ['Eseguire un test completo di throughput e latenza'],
  },
  'ipconfig / ifconfig': {
    summary: 'Mostra la configurazione degli adattatori di rete e del tunnel sicuro.',
    description:
      'Dettaglia IPv4, IPv6, gateway, DNS e stato della cifratura hardware AES-256 dell’interfaccia.',
    examples: ['Vedere configurazione di rete e tunnel cifrato'],
  },
  scrape: {
    summary: 'Estrae metadati, link e risorse di una pagina web.',
    description:
      'Analizza il DOM del target per elencare intestazioni, link esterni e immagini strutturate.',
    examples: [
      'Estrarre link e metadati da Hacker News',
      'Estrarre i dati della pagina caricata nella scheda attiva',
    ],
  },
  vault: {
    summary: 'Gestisce la cassaforte locale protetta con cifratura AES-256-GCM.',
    description:
      'Consente di ispezionare il checksum SHA-256 di integrità dei dati, bloccare o sbloccare con chiave maestra.',
    examples: [
      'Verificare stato della cifratura AES-256 e checksum',
      'Bloccare subito la cassaforte delle credenziali',
      'Sbloccare la cassaforte con la chiave maestra',
    ],
  },
  mfa: {
    summary: 'Amministra l’autenticazione multifattore TOTP (RFC 6238).',
    description:
      'Genera token temporanei a 6 cifre con finestra di 30 secondi, compatibili con Google Authenticator o Authy.',
    examples: [
      'Verificare stato della doppia autenticazione e token attivo',
      'Validare un codice di verifica a 6 cifre',
    ],
  },
  sync: {
    summary: 'Sincronizza il workspace cifrato con il cloud sicuro.',
    description:
      'Esegue un dump cifrato AES-256 di schede, script e segnalibri, richiedendo la validazione MFA al ripristino.',
    examples: [
      'Cifrare e caricare un backup nel cloud Terminus',
      'Scaricare e ripristinare un backup dal cloud',
    ],
  },
  hash: {
    summary: 'Calcola somme crittografiche SHA-256 istantanee.',
    description: 'Genera l’impronta crittografica tramite la Web Crypto API nativa.',
    examples: ['Generare l’hash SHA-256 di un testo'],
  },
  base64: {
    summary: 'Codifica o decodifica stringhe in formato Base64.',
    description: 'Utile per trasportare carichi binari, token di autenticazione o segreti.',
    examples: ['Codificare testo in Base64', 'Decodificare una stringa Base64'],
  },
  script: {
    summary: 'Amministra ed esegue flussi di lavoro e macro automatizzate.',
    description:
      'Esegue sequenze di comandi in modo ordinato con log passo per passo per automatizzare attività ripetitive.',
    examples: [
      'Vedere l’elenco degli script di automazione disponibili',
      'Eseguire il flusso completo di audit del sistema',
      'Eseguire una macro che apre le notizie e attiva la modalità lettura',
    ],
  },
  binds: {
    summary: 'Apre il pannello interattivo delle scorciatoie da tastiera personalizzabili.',
    description:
      'Consente di configurare scorciatoie (es. Ctrl+T, Ctrl+W, Ctrl+B, Ctrl+M, Ctrl+L) per lanciare qualsiasi comando.',
    examples: ['Aprire il gestore delle scorciatoie da tastiera'],
  },
  ext: {
    summary: 'Gestisce estensioni della console e plugin di terze parti.',
    description:
      'Consente di consultare il catalogo delle estensioni CLI, attivarle o integrarle nella console.',
    examples: ['Aprire il catalogo delle estensioni disponibili', 'Attivare l’estensione di estrazione web'],
  },
  log: {
    summary: 'Esporta i registri di audit e attività del sistema.',
    description:
      'Scarica file strutturati in JSON o testo semplice (.txt) con tutte le azioni registrate.',
    examples: ['Scaricare l’audit completo in JSON', 'Scaricare i log in un file di testo'],
  },
  // @it-more
};

const en: Record<string, CommandDocText> = {
  'ir a / goto': {
    summary: 'Navigates to any web page using natural Spanish syntax or the classic command.',
    description:
      'Replaces the traditional address bar. Pulls web content, paragraphs, navigable links and real site images straight into the console with retro frames, and syncs with the web viewer.',
    examples: [
      'Open the Hacker News portal with terminal view and images',
      'Look up Wikipedia with real photos',
      'Fast direct navigation',
    ],
  },
  'home / inicio': {
    summary: 'Returns to the start screen of the active tab.',
    description: 'Restores the tab’s initial environment so you can run new searches or commands.',
    examples: ['Return to the browser home page', 'Spanish alias for going home'],
  },
  'pestaña / pestana': {
    summary: 'Direct tab management with Spanish commands (switch, create, close).',
    description:
      'Switches between tabs numerically (e.g. pestaña 1, pestaña 2), opens a new tab or closes the current one.',
    examples: [
      'Switch to tab number 1',
      'Switch to tab number 2',
      'Create and activate a new tab',
      'Close the active tab',
    ],
  },
  'lynx / web': {
    summary: 'Shows websites inside the console like MS-DOS, with a gallery of real photos.',
    description:
      'Arachne/Lynx-style renderer for DOS that pulls real images, headings and clickable links into the command line.',
    examples: [
      'Render an article with real historical photos in the terminal',
      'Fast console web browsing',
    ],
  },
  search: {
    summary: 'Searches the web from Terminus Search.',
    description:
      'Queries DuckDuckGo and Wikipedia and shows results in Terminus Search, the browser’s internal search page, with history and reader view in the tab.',
    examples: ['Search for modern cryptography documentation', 'Search for quick console command guides'],
  },
  curl: {
    summary: 'Inspects real HTTP requests with headers, latency and status code.',
    description:
      'Sends HTTP requests through the backend or browser proxy to avoid CORS blocks. Returns server headers, size in bytes and a formatted body.',
    examples: ['Test a REST endpoint and inspect HTTP headers', 'Fetch a structured JSON resource'],
  },
  reader: {
    summary: 'Turns on the clean, distraction-free reading mode.',
    description:
      'Removes ads, heavy scripts and decorative styles to show the plain readable text of the current page.',
    examples: ['Switch the active tab to the ad-free reading view'],
  },
  source: {
    summary: 'Inspects the HTML/DOM source with line numbers.',
    description:
      'Shows the DOM tree and original markup of the loaded site for security and web development analysis.',
    examples: ['View the HTML source of the current page'],
  },
  tab: {
    summary: 'Full command-driven tab management.',
    description:
      'Opens blank or URL tabs, closes them by ID or switches between them quickly.',
    examples: [
      'Open a new tab to Hacker News',
      'Focus the second open tab',
      'List every open tab and its state',
      'Close the active tab',
    ],
  },
  bookmark: {
    summary: 'Saves encrypted bookmarks in the local AES-256 vault.',
    description:
      'Bookmarks are stored protected by the master key and can be listed or removed from the command line.',
    examples: ['Save a bookmark with a custom title', 'List every encrypted bookmark'],
  },
  'exit / salir': {
    summary: 'Checks the session state and shows exit options.',
    description:
      'Reports the integrity of the encrypted session and reminds you that the page and the console share a single text surface.',
    examples: ['Check session state and navigation options', 'Spanish alternative command'],
  },
  history: {
    summary: 'Shows the persistent history of executed commands, or clears it.',
    description:
      'Recalls any previous command quickly with the up (↑) and down (↓) arrows. History persists across sessions.',
    examples: ['List recently executed commands', 'Clear the persistent command history'],
  },
  'top / ps': {
    summary: 'Opens the interactive MS-DOS resource board.',
    description:
      'Shows ASCII bars for CPU, RAM, running threads, network throughput and visual/audible alerts on anomalies.',
    examples: ['Open the interactive MS-DOS resource monitor', 'Inspect the list of processes and running tasks'],
  },
  python: {
    summary: 'Runs Python code and scripts in real time in the browser.',
    description:
      'Isolated runtime with data structures, math operations, functions, for/while loops and JSON handling.',
    examples: [
      'Generate a list of squares with a list comprehension',
      'Operations with the math library',
      'Manipulate dictionaries and JSON objects',
    ],
  },
  bash: {
    summary: 'Runs shell command chains.',
    description: 'Runs several directives chained with `&&` or `;`.',
    examples: ['Check user identity and date/time', 'Chain a message and a security check'],
  },
  'shell nativo': {
    summary: 'Runs real system commands from the desktop app.',
    description:
      'In the Electron app the SHELL selector sends real commands to CMD, Windows PowerShell, PowerShell Core or Bash (Git Bash on Windows, WSL as an alternative, the system Bash on Linux/macOS). The working directory is real and persists per tab: "cd C:\\Users" enters the local disk, "cd .." goes up one level and "cd ~" returns to the user folder. Processes run with the user’s permissions. With a native shell the terminal uses a real PTY: vim, ssh, top and other full-screen programs work with keyboard, colors and Ctrl+C; non-interactive mode keeps the 120-second and 1 MB output limit. Many of these tools do not ship with Windows: see the "PTY interactivo" card for installation. In the web build the selector stays on TERMINUS because the browser cannot run local processes.',
    examples: [
      'Browse and list real Windows files',
      'List real processes with PowerShell',
      'Query the system from Git Bash, WSL or Linux',
    ],
  },
  'PTY interactivo': {
    summary: 'Runs full-screen programs and real interactive sessions.',
    description:
      'In the desktop app, picking CMD, PowerShell or Bash enables a real PTY: full-screen programs get keyboard input, colors and signals such as Ctrl+C. Terminus does not bundle these tools; they must exist in the chosen shell’s PATH. On Windows: install vim with "winget install vim.vim" (or use the one bundled with Git Bash); ssh through the optional OpenSSH Client feature (Settings > Apps > Optional features) or "winget install Microsoft.OpenSSH.Preview"; top and htop do not exist on Windows, so use WSL ("wsl --install" then "wsl top") or install htop inside the distro ("sudo apt install htop"). On macOS and Linux they are usually preinstalled. The top command in emulated mode (no native shell) opens the internal CPU/RAM monitor, not the system top.',
    examples: [
      'Install Vim on Windows with winget',
      'Install the OpenSSH client with winget',
      'Install WSL and a Linux distro (requires a restart)',
      'Install htop inside the WSL distro',
      'Open vim without configuration; quit with :q!',
      'Interactive SSH session (requires the OpenSSH client)',
      'View Linux processes from Windows with WSL',
    ],
  },
  'ls / dir': {
    summary: 'Lists files in the local workspace or the virtual disk.',
    description:
      'The terminal starts in /workspace, the real local disk. Use `cd /home/user` to return to the virtual demo system. `dir` mimics classic MS-DOS output with dates, times and sizes in bytes.',
    examples: [
      'List files in the current directory in Unix format',
      'List files in MS-DOS 6.22 format',
    ],
  },
  'cat / type': {
    summary: 'Shows the contents of a local or virtual file.',
    description: 'Reads configuration files, automation scripts or plain-text logs.',
    examples: [
      'Read the system welcome manual',
      'Inspect a sample Python script',
      'Read a configuration file MS-DOS style',
    ],
  },
  whoami: {
    summary: 'Shows the active session identity and encryption privileges.',
    description:
      'Prints the current user, terminal access level and two-factor verification status.',
    examples: ['Check the current security level and permissions'],
  },
  'clear / cls': {
    summary: 'Clears the screen and the terminal output buffer.',
    description: 'Wipes the visible console history to keep a clean workspace.',
    examples: ['Clear the terminal buffer (shortcut: Ctrl+L)'],
  },
  'voice / voz / dictar': {
    summary: 'Voice input and dictation through the Web Speech API (shortcut: Ctrl+M).',
    description:
      'Dictate natural-language commands (e.g. "inicio", "ir a wikipedia", "listar archivos", "pestaña 1") and transcribe web searches with a VU meter and phosphorescent CRT text.',
    examples: ['Check the voice engine status and recognized commands', 'Spanish alias for voice control'],
  },
  ping: {
    summary: 'Diagnoses latency and connection quality with a server.',
    description: 'Computes round-trip times (RTT) in milliseconds, jitter and packet loss.',
    examples: ['Measure response time against Cloudflare DNS', 'Check connectivity to Google'],
  },
  dns: {
    summary: 'Resolves DNS records (A, AAAA, MX) for any domain.',
    description:
      'Queries global name servers through the server API and returns the linked IP addresses.',
    examples: ['Look up google.com IPv4 and IPv6 records', 'Resolve GitHub server addresses'],
  },
  speedtest: {
    summary: 'Measures network bandwidth and latency.',
    description:
      'Evaluates download speed, upload speed under the AES-256 tunnel and connection stability.',
    examples: ['Run a full throughput and latency test'],
  },
  'ipconfig / ifconfig': {
    summary: 'Shows the configuration of network adapters and the secure tunnel.',
    description:
      'Details IPv4, IPv6, gateway, DNS and the AES-256 hardware encryption status on the interface.',
    examples: ['View network configuration and the encrypted tunnel'],
  },
  scrape: {
    summary: 'Extracts metadata, links and resources from a web page.',
    description:
      'Analyzes the target DOM to list headings, external links and structured images.',
    examples: [
      'Extract links and metadata from Hacker News',
      'Extract data from the page loaded in the active tab',
    ],
  },
  vault: {
    summary: 'Manages the local vault protected with AES-256-GCM encryption.',
    description:
      'Lets you inspect the SHA-256 integrity checksum of the data, lock or unlock with the master key.',
    examples: [
      'Check AES-256 status and checksum',
      'Immediately lock the credentials vault',
      'Unlock the vault with the master key',
    ],
  },
  mfa: {
    summary: 'Manages TOTP multi-factor authentication (RFC 6238).',
    description:
      'Generates six-digit time tokens with a 30-second window, compatible with Google Authenticator or Authy.',
    examples: [
      'Check two-factor status and the active token',
      'Validate a six-digit verification code',
    ],
  },
  sync: {
    summary: 'Syncs the encrypted workspace with the secure cloud.',
    description:
      'Creates an AES-256-encrypted dump of every tab, script and bookmark, requiring MFA validation on restore.',
    examples: [
      'Encrypt and upload a backup to the Terminus cloud',
      'Download and restore a backup from the cloud',
    ],
  },
  hash: {
    summary: 'Computes instant SHA-256 cryptographic sums.',
    description: 'Generates the cryptographic fingerprint through the native Web Crypto API.',
    examples: ['Generate the SHA-256 hash of a text'],
  },
  base64: {
    summary: 'Encodes or decodes strings in Base64.',
    description: 'Useful for carrying binary payloads, authentication tokens or secrets.',
    examples: ['Encode text as Base64', 'Decode a Base64 string'],
  },
  script: {
    summary: 'Manages and runs automated workflows and macros.',
    description:
      'Runs command sequences in order with step-by-step logs to automate repetitive tasks.',
    examples: [
      'Show the list of available automation scripts',
      'Run the full system audit flow',
      'Run a macro that opens the news and enables reader mode',
    ],
  },
  binds: {
    summary: 'Opens the interactive panel for customizable keyboard shortcuts.',
    description:
      'Lets you configure shortcuts (e.g. Ctrl+T, Ctrl+W, Ctrl+B, Ctrl+M, Ctrl+L) to fire any command.',
    examples: ['Open the keyboard shortcut manager'],
  },
  ext: {
    summary: 'Manages console extensions and third-party plugins.',
    description:
      'Lets you browse the CLI extension catalog, enable them or wire them into the console.',
    examples: ['Open the catalog of available extensions', 'Enable the web extraction extension'],
  },
  log: {
    summary: 'Exports the system audit and activity logs.',
    description:
      'Downloads structured JSON or plain-text (.txt) files with every recorded action.',
    examples: ['Download the full audit as JSON', 'Download the logs as a plain-text file'],
  },
  // @en-more
};

/** Spanish placeholders inside the syntax strings; the command keywords stay as they are. */
const SYNTAX_TOKENS: Record<Exclude<Locale, 'es'>, [string, string][]> = {
  de: [
    ['términos de búsqueda', 'Suchbegriffe'],
    ['Selector SHELL:', 'SHELL-Auswahl:'],
    [' o ', ' oder '],
    ['texto', 'Text'],
    ['comandos', 'Befehle'],
    ['argumentos', 'Argumente'],
    ['archivo', 'Datei'],
    ['dominio', 'Domain'],
    ['nombre', 'Name'],
    ['código', 'Code'],
  ],
  fr: [
    ['términos de búsqueda', 'termes de recherche'],
    ['Selector SHELL:', 'Sélecteur SHELL:'],
    [' o ', ' ou '],
    ['texto', 'texte'],
    ['comandos', 'commandes'],
    ['argumentos', 'arguments'],
    ['archivo', 'fichier'],
    ['dominio', 'domaine'],
    ['nombre', 'nom'],
    ['código', 'code'],
  ],
  it: [
    ['términos de búsqueda', 'termini di ricerca'],
    ['Selector SHELL:', 'Selettore SHELL:'],
    ['texto', 'testo'],
    ['comandos', 'comandi'],
    ['argumentos', 'argomenti'],
    ['archivo', 'file'],
    ['dominio', 'dominio'],
    ['nombre', 'nome'],
    ['código', 'codice'],
  ],
  en: [
    ['términos de búsqueda', 'search terms'],
    ['Selector SHELL:', 'SHELL selector:'],
    [' o ', ' or '],
    ['texto', 'text'],
    ['comandos', 'commands'],
    ['argumentos', 'arguments'],
    ['archivo', 'file'],
    ['dominio', 'domain'],
    ['nombre', 'name'],
    ['código', 'code'],
  ],
};

export const COMMAND_DOC_TEXT: Record<Exclude<Locale, 'es'>, Record<string, CommandDocText>> = {
  de,
  fr,
  it,
  en,
};

/** Merges the localized text into the Spanish reference catalogue. */
export const localizeCommandDocs = (locale: Locale, docs: CommandDoc[]): CommandDoc[] => {
  if (locale === 'es') return docs;
  const table = COMMAND_DOC_TEXT[locale];
  const tokens = SYNTAX_TOKENS[locale];
  const localizeSyntax = (syntax: string) =>
    tokens.reduce((text, [from, to]) => text.split(from).join(to), syntax);
  return docs.map((doc) => {
    const text = table[doc.command];
    if (!text) return doc;
    return {
      ...doc,
      syntax: localizeSyntax(doc.syntax),
      summary: text.summary,
      description: text.description,
      examples: doc.examples.map((example, index) => ({
        ...example,
        description: text.examples[index] ?? example.description,
      })),
    };
  });
};
