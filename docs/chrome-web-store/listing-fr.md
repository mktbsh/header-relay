# Chrome Web Store Listing (Français)

Texte de localisation en français pour la fiche « Informations sur la boutique » du Developer Dashboard.

## Product Details

### Name

Header Relay — Modifie les en-têtes de requête et capture ceux de réponse

### Summary

Capture les en-têtes de réponse HTTP et relaie des en-têtes de requête fixes ou capturés pour le développement et les tests d'API.

### Category

Developer Tools

### Language

French

### Detailed Description

Header Relay aide les développeurs à vérifier le comportement des requêtes HTTP côté navigateur lorsqu'une API ou une application web dépend d'en-têtes personnalisés, d'en-têtes de passerelle, de jetons de session, d'ID de trace ou de métadonnées de requête spécifiques à l'environnement.

Créez un profil, choisissez les origines cibles, configurez des en-têtes de requête fixes et listez les en-têtes de réponse à capturer. Lorsqu'une réponse correspondante inclut un en-tête de capture configuré, Header Relay conserve cette valeur en mémoire pour la session de navigateur en cours et utilise les règles de session declarativeNetRequest de Chrome pour l'ajouter aux requêtes correspondantes ultérieures.

Fonctionnalités principales :

- Relais d'en-têtes par origine pour les environnements locaux, de staging, internes et de test.
- En-têtes de requête fixes pour les valeurs qui doivent toujours être ajoutées.
- En-têtes de réponse capturés pour des valeurs telles que les jetons de session, les ID de trace ou les en-têtes de passerelle.
- Motifs glob de chemins exclus pour les ressources ou points de terminaison qui ne doivent pas recevoir d'en-têtes gérés par le relais.
- Testeur de chemins exclus pour vérifier les règles de correspondance glob avant l'enregistrement.
- URL Probe pour vérifier si une URL correspond, est exclue et quels en-têtes seraient ajoutés — fonctionne même sur des brouillons non enregistrés.
- Paramètres en pleine page avec navigation par sections pour les profils, origines, en-têtes, chemins exclus, URL Probe et journaux d'audit.
- Plusieurs profils peuvent rester actifs en même temps, et les profils individuels peuvent être supprimés lorsqu'ils ne sont plus nécessaires.
- Modes d'affichage confortable et compact partagés entre le popup et la page de paramètres.
- Interface de style iOS cohérente dans le popup et les paramètres pour une expérience native homogène.
- Vue d'état compacte du popup pour les en-têtes actifs, les valeurs capturées, l'état de session et le nombre de règles DNR.
- Journaux d'audit locaux avec rétention automatique ; les URL de requête ne sont jamais conservées.
- Localisation en japonais, coréen, espagnol, français, allemand, chinois simplifié et chinois traditionnel.

Confidentialité et sécurité :

- Header Relay n'envoie pas les paramètres de profil, les journaux d'audit, les événements d'utilisation, les identifiants d'analyse, les données de navigation ni les en-têtes capturés au développeur, à des fournisseurs d'analyse ou à des serveurs sans rapport. Les valeurs d'en-tête configurées ne sont ajoutées qu'aux requêtes correspondant aux origines cibles.
- Les valeurs capturées sont conservées uniquement dans un stockage de session en mémoire, effacé au redémarrage du navigateur, à la désactivation/rechargement/mise à jour de l'extension, à la désactivation du profil, au changement de règles, à la révocation de l'accès à l'hôte ou à l'effacement manuel, et affichées telles quelles dans l'interface pour que les développeurs puissent les inspecter.
- Les noms d'en-tête sensibles affichent un avertissement. `Cookie` reste disponible pour les flux de développement avec un avertissement explicite sur l'état du navigateur ; les en-têtes réservés aux réponses ou gérés par le transport sont rejetés.
- Les journaux d'audit ne conservent pas les URL de requête : les URL sont traitées en mémoire uniquement pour la correspondance d'origine et supprimées à la fermeture du navigateur.
- L'accès HTTP localhost est inclus pour le flux de développement local par défaut. Tout autre hôte n'est demandé que lors de l'ajout de son origine cible, et l'autorisation facultative peut être révoquée à tout moment depuis les paramètres des extensions Chrome.

Cette extension est destinée aux flux de travail des développeurs et de l'assurance qualité (QA). Ne l'utilisez pas pour stocker des identifiants de production, sauf si cela est acceptable pour votre profil de navigateur local.

Version 0.5.0 — ajout des autorisations d'hôte par origine, des valeurs capturées limitées à la session, des protections pour les en-têtes sensibles, des profils supprimables, des paramètres d'affichage compact et des journaux d'audit à des fins de diagnostic uniquement.
