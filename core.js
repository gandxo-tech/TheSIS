/* ============================================================
   SIS V2 — core.js
   Say It Safely · Fondation technique globale
   Auteur: gbaguidiexauce
   Stack : Vanilla JS IIFE, Firebase Compat 9.23.0
   RÈGLE : Pas d'ES6 modules, pas de type="module"
   ============================================================ */

(function (SIS) {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     1. CONFIGURATION FIREBASE
  ────────────────────────────────────────────────────────── */
  SIS.firebaseConfig = {
    apiKey:            'AIzaSyBqk3L_qkolD41H3yvHEzz4O-Sr15I-Tko',
    authDomain:        'gandxoanonymous.firebaseapp.com',
    projectId:         'gandxoanonymous',
    storageBucket:     'gandxoanonymous.appspot.com',
    messagingSenderId: '836606625364',
    appId:             '1:836606625364:web:7150571998131c41c0cfc1',
    measurementId:     'G-97TCHJ33KW',
    databaseURL:       'https://gandxoanonymous-default-rtdb.firebaseio.com'
  };

  /* ──────────────────────────────────────────────────────────
     2. CONFIGURATION CLOUDINARY
  ────────────────────────────────────────────────────────── */
  SIS.cloudinary = {
    cloudName:    'duddyzckz',
    uploadPreset: 'ml_defaulte',
    baseUrl:      'https://res.cloudinary.com/duddyzckz/image/upload',

    /* Transformations selon le contexte */
    transforms: {
      avatar:   'f_auto,q_auto:good,w_150,h_150,c_fill,g_face',
      feed:     'f_auto,q_auto:good,w_800,c_limit',
      thumb:    'f_auto,q_auto:low,w_120,h_120,c_fill',
      story:    'f_auto,q_auto:good,w_480,c_limit',
      cover:    'f_auto,q_auto:good,w_480,h_160,c_fill',
      original: 'f_auto,q_auto'
    },

    /* Construire une URL Cloudinary optimisée */
    url: function (publicId, type) {
      if (!publicId) return '';
      var t = SIS.cloudinary.transforms[type] || SIS.cloudinary.transforms.original;
      return SIS.cloudinary.baseUrl + '/' + t + '/' + publicId;
    }
  };

  /* ──────────────────────────────────────────────────────────
     3. INITIALISATION FIREBASE
  ────────────────────────────────────────────────────────── */
  SIS.db   = null;
  SIS.auth = null;
  SIS.rtdb = null;
  SIS.user = null; /* utilisateur courant */

  SIS.initFirebase = function () {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(SIS.firebaseConfig);
    }
    SIS.db   = firebase.firestore();
    SIS.auth = firebase.auth();
    SIS.rtdb = firebase.database();

    /* Cache Firestore offline (économise les lectures) */
    SIS.db.enablePersistence({ synchronizeTabs: true })
      .catch(function (err) {
        if (err.code === 'failed-precondition') {
          /* Plusieurs onglets ouverts — OK, on continue */
        }
      });

    /* Écoute de l'état auth */
    SIS.auth.onAuthStateChanged(function (user) {
      SIS.user = user;
      if (typeof SIS._onAuthReady === 'function') {
        SIS._onAuthReady(user);
      }
    });
  };

  /* Callback appelé quand auth state est prêt */
  SIS.onAuthReady = function (cb) {
    SIS._onAuthReady = cb;
    if (SIS.user !== undefined && typeof cb === 'function') {
      cb(SIS.user);
    }
  };

  /* ──────────────────────────────────────────────────────────
     4. GÉNÉRATEUR DE PSEUDO ANONYME UNIQUE
     Format: AdjectifNom4chiffres (ex: SilentWolf_4829)
     Collisions quasi-nulles: 120 adj × 180 noms × 9000 = ~194M combos
  ────────────────────────────────────────────────────────── */
  SIS.pseudoGen = (function () {
    var adj = [
      'Silent','Hidden','Dark','Ghost','Shadow','Mystic','Lunar','Cosmic',
      'Frozen','Blazing','Storm','Void','Neon','Cyber','Astral','Crimson',
      'Golden','Silver','Iron','Phantom','Velvet','Toxic','Brave','Wild',
      'Swift','Calm','Bold','Wise','Free','Deep','Raw','Pure','Lost','Torn',
      'Rogue','Stray','Quiet','Loud','Sharp','Soft','Hard','Faint','Bright',
      'Black','White','Grey','Blue','Red','Green','Azure','Amber','Jade',
      'Ruby','Onyx','Pearl','Ivory','Ebony','Rusty','Shiny','Dull','Vivid',
      'Blaze','Frost','Flash','Surge','Drift','Gloom','Haze','Mist','Fog',
      'Grim','Slim','Thin','Vast','Tiny','Mega','Ultra','Super','Hyper',
      'Retro','Neo','Proto','Alpha','Beta','Delta','Omega','Sigma','Zeta',
      'Aero','Aqua','Terra','Pyro','Cryo','Hydro','Solar','Lunar','Astro',
      'Digital','Analog','Static','Dynamic','Kinetic','Electric','Sonic',
      'Magnetic','Atomic','Quantum','Binary','Neural','Vector','Matrix',
      'Nomad','Rebel','Exile','Rogue','Loner','Drifter','Seeker','Hunter',
      'Night','Dawn','Dusk','Noon','Twilight','Midnight','Sunrise','Sunset'
    ];

    var nouns = [
      'Wolf','Fox','Bear','Eagle','Hawk','Raven','Owl','Tiger','Lion',
      'Snake','Shark','Whale','Panther','Lynx','Falcon','Dragon','Phoenix',
      'Viper','Cobra','Jaguar','Puma','Cheetah','Leopard','Hyena','Jackal',
      'Crow','Crane','Heron','Kite','Osprey','Condor','Vulture','Finch',
      'Storm','Blade','Shield','Arrow','Spear','Lance','Sword','Axe','Bow',
      'Flame','Frost','Thunder','Bolt','Wave','Tide','Current','Stream',
      'Stone','Rock','Boulder','Cliff','Peak','Ridge','Vale','Glen',
      'Soul','Mind','Heart','Spirit','Ghost','Shade','Echo','Pulse',
      'Cipher','Code','Script','Signal','Byte','Pixel','Frame','Layer',
      'Drift','Surge','Glitch','Spark','Flash','Flare','Blaze','Glow',
      'Path','Road','Trail','Track','Route','Line','Edge','Curve',
      'Core','Root','Node','Hub','Link','Chain','Grid','Net','Mesh',
      'Wing','Claw','Fang','Horn','Spine','Scale','Shell','Hide',
      'Star','Moon','Sun','Nova','Comet','Nebula','Void','Abyss',
      'Mask','Veil','Cloak','Cape','Shroud','Wraith','Specter','Revenant',
      'Tide','Gale','Squall','Tempest','Cyclone','Tornado','Blizzard',
      'Ruin','Dust','Ash','Ember','Cinder','Shard','Fragment','Relic',
      'Song','Voice','Whisper','Shout','Cry','Hymn','Chant','Echo',
      'Myth','Legend','Fable','Saga','Tale','Lore','Omen','Oracle'
    ];

    return {
      generate: function () {
        var a = adj[Math.floor(Math.random() * adj.length)];
        var n = nouns[Math.floor(Math.random() * nouns.length)];
        var d = String(Math.floor(1000 + Math.random() * 9000));
        return a + n + '_' + d;
      },

      /* Vérifie unicité dans Firestore avant d'utiliser */
      generateUnique: function (callback) {
        var attempt = function (tries) {
          if (tries > 10) {
            /* Après 10 tentatives on ajoute un timestamp */
            var pseudo = SIS.pseudoGen.generate() + Date.now().toString().slice(-3);
            callback(pseudo);
            return;
          }
          var candidate = SIS.pseudoGen.generate();
          SIS.db.collection('users')
            .where('pseudo', '==', candidate)
            .limit(1)
            .get()
            .then(function (snap) {
              if (snap.empty) {
                callback(candidate);
              } else {
                attempt(tries + 1);
              }
            })
            .catch(function () {
              /* En cas d'erreur réseau, on utilise quand même */
              callback(candidate);
            });
        };
        attempt(0);
      }
    };
  })();

  /* ──────────────────────────────────────────────────────────
     5. AES-256-GCM — Chiffrement bout en bout (messages chat)
  ────────────────────────────────────────────────────────── */
  SIS.crypto = (function () {
    var ENC = 'AES-GCM';
    var KEY_LEN = 256;

    /* Dériver une clé depuis un secret partagé (roomId + uids triés) */
    function deriveKey(secret) {
      var encoder = new TextEncoder();
      var keyMaterial = encoder.encode(secret);
      return crypto.subtle.importKey('raw', keyMaterial, { name: 'PBKDF2' }, false, ['deriveKey'])
        .then(function (baseKey) {
          var salt = encoder.encode('SIS_SALT_V2_' + secret.substring(0, 8));
          return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
            baseKey,
            { name: ENC, length: KEY_LEN },
            false,
            ['encrypt', 'decrypt']
          );
        });
    }

    function bufToB64(buf) {
      /* Sécurisé pour gros buffers — évite stack overflow sur Android */
      var bytes = new Uint8Array(buf);
      var binary = '';
      var chunk = 8192; /* Traiter par blocs pour éviter stack overflow */
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }

    function b64ToBuf(b64) {
      var bin = atob(b64);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return buf;
    }

    return {
      /* Chiffrer un message */
      encrypt: function (plaintext, secret) {
        return deriveKey(secret).then(function (key) {
          var iv = crypto.getRandomValues(new Uint8Array(12));
          var encoded = new TextEncoder().encode(plaintext);
          return crypto.subtle.encrypt({ name: ENC, iv: iv }, key, encoded)
            .then(function (cipherBuf) {
              return bufToB64(iv) + ':' + bufToB64(cipherBuf);
            });
        });
      },

      /* Déchiffrer un message */
      decrypt: function (ciphertext, secret) {
        return deriveKey(secret).then(function (key) {
          var parts = ciphertext.split(':');
          if (parts.length !== 2) return Promise.resolve('[message illisible]');
          var iv  = b64ToBuf(parts[0]);
          var buf = b64ToBuf(parts[1]);
          return crypto.subtle.decrypt({ name: ENC, iv: iv }, key, buf)
            .then(function (plain) {
              return new TextDecoder().decode(plain);
            })
            .catch(function () {
              return '[message illisible]';
            });
        });
      },

      /* Générer un roomSecret depuis deux UIDs */
      roomSecret: function (uid1, uid2) {
        var sorted = [uid1, uid2].sort();
        return 'room_' + sorted[0] + '_' + sorted[1];
      }
    };
  })();

  /* ──────────────────────────────────────────────────────────
     6. COMPRESSION IMAGE (Canvas API) + UPLOAD CLOUDINARY
  ────────────────────────────────────────────────────────── */
  SIS.image = (function () {

    /* Compression locale avant envoi */
    function compress(file, options) {
      return new Promise(function (resolve, reject) {
        var defaults = {
          maxWidth:  1080,
          maxHeight: 1080,
          quality:   0.82,
          format:    'image/webp' /* WebP = meilleur ratio qualité/poids */
        };
        var opts = Object.assign({}, defaults, options || {});

        /* Vérifier support WebP, fallback JPEG */
        var canvas = document.createElement('canvas');
        var supportsWebP = canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
        if (!supportsWebP) opts.format = 'image/jpeg';

        var reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function (e) {
          var img = new Image();
          img.onerror = reject;
          img.onload = function () {
            /* Calcul dimensions proportionnelles */
            var w = img.width;
            var h = img.height;
            var ratio = Math.min(opts.maxWidth / w, opts.maxHeight / h, 1);
            var tw = Math.round(w * ratio);
            var th = Math.round(h * ratio);

            canvas.width  = tw;
            canvas.height = th;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, tw, th);

            canvas.toBlob(function (blob) {
              if (!blob) { reject(new Error('Compression échouée')); return; }
              resolve(blob);
            }, opts.format, opts.quality);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    /* Upload vers Cloudinary avec progression */
    function upload(file, preset, onProgress) {
      return new Promise(function (resolve, reject) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', preset || SIS.cloudinary.uploadPreset);
        fd.append('folder', 'sis_v2');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + SIS.cloudinary.cloudName + '/image/upload');

        if (typeof onProgress === 'function') {
          xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          };
        }

        xhr.onload = function () {
          if (xhr.status === 200) {
            var res = JSON.parse(xhr.responseText);
            resolve({
              publicId: res.public_id,
              url:      res.secure_url,
              width:    res.width,
              height:   res.height,
              format:   res.format,
              bytes:    res.bytes
            });
          } else {
            reject(new Error('Upload Cloudinary échoué: ' + xhr.status));
          }
        };

        xhr.onerror = function () { reject(new Error('Erreur réseau upload')); };
        xhr.send(fd);
      });
    }

    return {
      /* Compresser puis uploader */
      processAndUpload: function (file, options, onProgress) {
        /* Paramètres selon le contexte */
        var presets = {
          avatar:  { maxWidth: 400,  maxHeight: 400,  quality: 0.85 },
          post:    { maxWidth: 1080, maxHeight: 1080, quality: 0.82 },
          story:   { maxWidth: 720,  maxHeight: 1280, quality: 0.80 },
          cover:   { maxWidth: 960,  maxHeight: 320,  quality: 0.80 },
          certif:  { maxWidth: 1200, maxHeight: 1600, quality: 0.88 }
        };

        var compressOpts = presets[options.type] || presets.post;

        /* Si c'est déjà petit (<300KB), compression légère */
        if (file.size < 300 * 1024) {
          compressOpts.quality = Math.min(compressOpts.quality + 0.08, 0.92);
        }

        return compress(file, compressOpts)
          .then(function (blob) {
            /* Créer un File depuis le Blob pour garder le nom */
            var ext = compressOpts.format === 'image/webp' ? 'webp' : 'jpg';
            var compressed = new File([blob], 'sis_' + Date.now() + '.' + ext, {
              type: compressOpts.format || 'image/webp'
            });
            return upload(compressed, options.preset, onProgress);
          });
      },

      /* Upload direct sans compression (PDFs, pièces identité certif) */
      uploadRaw: function (file, onProgress) {
        return upload(file, SIS.cloudinary.uploadPreset, onProgress);
      },

      /* Construire URL optimisée */
      url: SIS.cloudinary.url,

      compress: compress
    };
  })();

  /* ──────────────────────────────────────────────────────────
     7. RENDER AVATAR + BADGE ÉTOILE CERTIFIÉ
     Utilisé sur toutes les pages partout où un avatar apparaît
  ────────────────────────────────────────────────────────── */
  /* renderAvatar: helpers inline pour éviter dépendance sur SIS.utils non encore déclaré */
  function _escHtml(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _uid() { return Date.now().toString(36) + Math.random().toString(36).substring(2,9); }
  function _pseudoToGrad(pseudo) {
    var grads=['linear-gradient(135deg,#5B8EF4,#8B5CF6)','linear-gradient(135deg,#f04f5a,#f59e0b)','linear-gradient(135deg,#22d47a,#5B8EF4)','linear-gradient(135deg,#8B5CF6,#f04f5a)','linear-gradient(135deg,#f59e0b,#22d47a)','linear-gradient(135deg,#06b6d4,#8B5CF6)','linear-gradient(135deg,#f04f5a,#8B5CF6)','linear-gradient(135deg,#22d47a,#8B5CF6)'];
    var h=0; for(var i=0;i<(pseudo||'').length;i++){h=(pseudo||'').charCodeAt(i)+((h<<5)-h);}
    return grads[Math.abs(h)%grads.length];
  }

  SIS.renderAvatar = function (options) {
    /*
      options: {
        photoUrl:    string | null,
        pseudo:      string,
        certified:   boolean,
        size:        'xs' | 'sm' | 'md' | 'lg' | 'xl',
        gradient:    string | null,  (CSS custom si pas de photo)
        onClick:     function | null
      }
    */
    var size      = options.size || 'sm';
    var certified = options.certified === true;
    var pseudo    = options.pseudo || '?';
    var initial   = pseudo.charAt(0).toUpperCase();
    var photoUrl  = options.photoUrl || null;
    var gradient  = options.gradient || (SIS.utils ? SIS.utils.pseudoToGradient(pseudo) : _pseudoToGrad(pseudo));
    var clickable = typeof options.onClick === 'function';

    /* Badge étoile SVG SIS — ID unique généré UNE seule fois */
    var certId = 'cg_' + _uid();
    var badgeSvg = certified
      ? '<svg class="badge-cert ' + (size !== 'sm' && size !== 'xs' ? size : '') + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<defs>' +
        '<linearGradient id="' + certId + '" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" stop-color="#5B8EF4"/>' +
        '<stop offset="100%" stop-color="#8B5CF6"/>' +
        '</linearGradient>' +
        '</defs>' +
        '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" ' +
        'fill="url(#' + certId + ')" ' +
        'stroke="none"/>' +
        '<polygon points="12,4 14.5,9.5 20.5,10.3 16.2,14.5 17.2,20.4 12,17.5 6.8,20.4 7.8,14.5 3.5,10.3 9.5,9.5" ' +
        'fill="white" opacity="0.35"/>' +
        '</svg>'
      : '';

    /* Avatar HTML */
    var avContent = photoUrl
      ? '<img src="' + SIS.cloudinary.url(photoUrl, 'avatar') + '" alt="' + _escHtml(pseudo) + '" class="av av-' + size + '" loading="lazy" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
        '<div class="av av-' + size + '" style="display:none;background:' + gradient + '">' + initial + '</div>'
      : '<div class="av av-' + size + '" style="background:' + gradient + '">' + initial + '</div>';

    var html = '<div class="av-wrap' + (clickable ? ' clickable' : '') + '" data-pseudo="' + _escHtml(pseudo) + '">' +
      avContent +
      badgeSvg +
      '</div>';

    /* Attacher le click handler après insertion dans DOM */
    if (clickable) {
      SIS._pendingAvatarClicks = SIS._pendingAvatarClicks || [];
      SIS._pendingAvatarClicks.push({ pseudo: pseudo, fn: options.onClick });
    }

    return html;
  };

  /* Attacher tous les click handlers en attente */
  SIS.bindAvatarClicks = function (container) {
    if (!SIS._pendingAvatarClicks) return;
    var clicks = SIS._pendingAvatarClicks.splice(0);
    clicks.forEach(function (item) {
      var els = (container || document).querySelectorAll('.av-wrap.clickable[data-pseudo="' + item.pseudo + '"]');
      els.forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          item.fn(item.pseudo, e);
        });
      });
    });
  };

  /* ──────────────────────────────────────────────────────────
     8. SYSTÈME DE NOTIFICATIONS IN-APP
  ────────────────────────────────────────────────────────── */
  SIS.notifs = (function () {
    var _listener = null;
    var _unreadCount = 0;

    /* Types de notif */
    var TYPES = {
      LIKE:      'like',
      FOLLOW:    'follow',
      COMMENT:   'comment',
      ANON:      'anon',
      MENTION:   'mention',
      ECHO:      'echo',
      BATTLE:    'battle',
      BURN:      'burn',
      SYSTEM:    'system'
    };

    /* Icônes et couleurs par type */
    var META = {
      like:    { icon: '❤️',  color: '#f04f5a', bg: 'rgba(240,79,90,0.12)'    },
      follow:  { icon: '👤',  color: '#5B8EF4', bg: 'rgba(91,142,244,0.12)'  },
      comment: { icon: '💬',  color: '#22d47a', bg: 'rgba(34,212,122,0.12)'  },
      anon:    { icon: '🔒',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)'  },
      mention: { icon: '@',   color: '#5B8EF4', bg: 'rgba(91,142,244,0.12)'  },
      echo:    { icon: '🔄',  color: '#f5a623', bg: 'rgba(245,166,35,0.12)'  },
      battle:  { icon: '⚡',  color: '#fbbf24', bg: 'rgba(245,166,35,0.12)'  },
      burn:    { icon: '🔥',  color: '#f04f5a', bg: 'rgba(240,79,90,0.12)'   },
      system:  { icon: 'ℹ️', color: '#5B8EF4', bg: 'rgba(91,142,244,0.12)'  }
    };

    /* Écouter les notifs en temps réel */
    function listen(uid) {
      if (_listener) { _listener(); _listener = null; }

      _listener = SIS.db
        .collection('notifications')
        .doc(uid)
        .collection('items')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(function (snap) {
          _unreadCount = 0;
          snap.forEach(function (doc) {
            if (!doc.data().read) _unreadCount++;
          });
          SIS.notifs._updateBadge(_unreadCount);
          if (typeof SIS.notifs.onUpdate === 'function') {
            SIS.notifs.onUpdate(snap);
          }
        }, function (err) {
          console.warn('SIS notifs error:', err);
        });
    }

    /* Mettre à jour le badge dans le bottom nav */
    function updateBadge(count) {
      var badges = document.querySelectorAll('.bnav-notif-badge');
      badges.forEach(function (b) {
        if (count > 0) {
          b.textContent = count > 99 ? '99+' : String(count);
          b.style.display = 'flex';
        } else {
          b.style.display = 'none';
        }
      });
    }

    /* Créer une notif (côté serveur via Firestore) */
    function push(targetUid, type, data) {
      if (!targetUid || targetUid === (SIS.user && SIS.user.uid)) return;
      return SIS.db
        .collection('notifications')
        .doc(targetUid)
        .collection('items')
        .add(Object.assign({
          type:      type,
          read:      false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, data || {}));
    }

    /* Marquer toutes comme lues */
    function markAllRead(uid) {
      var batch = SIS.db.batch();
      return SIS.db
        .collection('notifications')
        .doc(uid)
        .collection('items')
        .where('read', '==', false)
        .limit(50)
        .get()
        .then(function (snap) {
          snap.forEach(function (doc) {
            batch.update(doc.ref, { read: true });
          });
          return batch.commit();
        });
    }

    /* Arrêter d'écouter (quand on quitte la page) */
    function stop() {
      if (_listener) { _listener(); _listener = null; }
    }

    return {
      TYPES:         TYPES,
      META:          META,
      listen:        listen,
      push:          push,
      markAllRead:   markAllRead,
      stop:          stop,
      getUnread:     function () { return _unreadCount; },
      _updateBadge:  updateBadge,
      onUpdate:      null /* surcharge depuis app.js */
    };
  })();

  /* ──────────────────────────────────────────────────────────
     9. TOAST SYSTEM (notifications visuelles rapides)
  ────────────────────────────────────────────────────────── */
  SIS.toast = (function () {
    var container = null;

    function getContainer() {
      if (!container) {
        container = document.getElementById('toast-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'toast-container';
          document.body.appendChild(container);
        }
      }
      return container;
    }

    function show(options) {
      var c   = getContainer();
      var el  = document.createElement('div');
      var type = options.type || 'info';
      var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

      el.className = 'toast';
      el.innerHTML =
        '<div class="toast-icon ' + type + '">' +
          '<span style="font-size:14px;font-weight:700;">' + (icons[type] || icons.info) + '</span>' +
        '</div>' +
        '<div class="toast-body">' +
          (options.title ? '<div class="toast-title">' + SIS.utils.escHtml(options.title) + '</div>' : '') +
          (options.msg   ? '<div class="toast-msg">'   + SIS.utils.escHtml(options.msg)   + '</div>' : '') +
        '</div>';

      c.appendChild(el);

      /* Auto-remove */
      var dur = options.duration || 3500;
      var remove = function () {
        el.classList.add('removing');
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 260);
      };

      var timer = setTimeout(remove, dur);
      el.addEventListener('click', function () { clearTimeout(timer); remove(); });
    }

    return {
      success: function (title, msg, dur) { show({ type: 'success', title: title, msg: msg, duration: dur }); },
      error:   function (title, msg, dur) { show({ type: 'error',   title: title, msg: msg, duration: dur }); },
      info:    function (title, msg, dur) { show({ type: 'info',    title: title, msg: msg, duration: dur }); },
      warning: function (title, msg, dur) { show({ type: 'warning', title: title, msg: msg, duration: dur }); }
    };
  })();

  /* ──────────────────────────────────────────────────────────
     10. AUTHENTIFICATION
  ────────────────────────────────────────────────────────── */
  SIS.authHelper = (function () {

    /* Inscription avec email + pseudo */
    function register(email, password, pseudo) {
      /* Sanitize pseudo */
      pseudo = pseudo.replace(/[^a-zA-Z0-9_\-\.]/g, '').substring(0, 24);
      if (pseudo.length < 3) {
        return Promise.reject(new Error('Pseudo trop court (min 3 caractères)'));
      }

      /* Vérifier unicité pseudo */
      return SIS.db.collection('users')
        .where('pseudo', '==', pseudo)
        .limit(1)
        .get()
        .then(function (snap) {
          if (!snap.empty) {
            throw new Error('Ce pseudo est déjà pris');
          }
          return firebase.auth().createUserWithEmailAndPassword(email, password);
        })
        .then(function (cred) {
          var uid = cred.user.uid;
          var now = firebase.firestore.FieldValue.serverTimestamp();

          /* Envoyer email de vérification */
          cred.user.sendEmailVerification();

          /* Créer le profil Firestore */
          return SIS.db.collection('users').doc(uid).set({
            uid:        uid,
            pseudo:     pseudo,
            email:      email,
            photoUrl:   null,
            bio:        '',
            certified:  false,
            interests:  [],
            followers:  0,
            following:  0,
            postsCount: 0,
            createdAt:  now,
            lastSeen:   now,
            theme:      'dark',
            lang:       'fr',
            isAnon:     false,
            banned:     false,
            reportCount: 0
          });
        });
    }

    /* Connexion email */
    function login(email, password) {
      return firebase.auth().signInWithEmailAndPassword(email, password);
    }

    /* Connexion anonyme avec pseudo généré */
    function loginAnon(callback) {
      return firebase.auth().signInAnonymously()
        .then(function (cred) {
          var uid = cred.user.uid;
          var now = firebase.firestore.FieldValue.serverTimestamp();

          return new Promise(function (resolve) {
            SIS.pseudoGen.generateUnique(function (pseudo) {
              SIS.db.collection('users').doc(uid).set({
                uid:         uid,
                pseudo:      pseudo,
                email:       null,
                photoUrl:    null,
                bio:         '',
                certified:   false,
                interests:   [],
                followers:   0,
                following:   0,
                postsCount:  0,
                createdAt:   now,
                lastSeen:    now,
                theme:       'dark',
                lang:        'fr',
                isAnon:      true,
                banned:      false,
                reportCount: 0
              }, { merge: true }).then(function () {
                if (typeof callback === 'function') callback(pseudo);
                resolve(pseudo);
              }).catch(function () {
                if (typeof callback === 'function') callback(pseudo);
                resolve(pseudo);
              });
            });
          });
        });
    }

    /* Réinitialisation mot de passe */
    function resetPassword(email) {
      return firebase.auth().sendPasswordResetEmail(email);
    }

    /* Déconnexion */
    function logout() {
      SIS.notifs.stop();
      /* Présence offline */
      if (SIS.user) {
        SIS.db.collection('users').doc(SIS.user.uid)
          .update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() })
          .catch(function () {});
      }
      return firebase.auth().signOut();
    }

    /* Récupérer le profil complet d'un user */
    function getProfile(uid) {
      return SIS.db.collection('users').doc(uid).get()
        .then(function (doc) {
          if (doc.exists) return Object.assign({ uid: uid }, doc.data());
          return null;
        });
    }

    /* Mettre à jour le profil */
    function updateProfile(uid, data) {
      /* Sanitize les champs texte */
      if (data.bio)   data.bio   = data.bio.substring(0, 160);
      if (data.pseudo) data.pseudo = data.pseudo.replace(/[^a-zA-Z0-9_\-\.]/g, '').substring(0, 24);
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      return SIS.db.collection('users').doc(uid).update(data);
    }

    /* Présence en ligne (RTDB pour la rapidité) */
    function setPresence(uid) {
      var ref = SIS.rtdb.ref('presence/' + uid);
      ref.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      ref.onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }

    /* Vérifier si email est confirmé */
    function isEmailVerified() {
      return SIS.auth.currentUser && SIS.auth.currentUser.emailVerified;
    }

    /* Recharger l'état de vérification email */
    function reloadUser() {
      if (!SIS.auth.currentUser) return Promise.resolve(false);
      return SIS.auth.currentUser.reload().then(function () {
        return SIS.auth.currentUser.emailVerified;
      });
    }

    return {
      register:        register,
      login:           login,
      loginAnon:       loginAnon,
      resetPassword:   resetPassword,
      logout:          logout,
      getProfile:      getProfile,
      updateProfile:   updateProfile,
      setPresence:     setPresence,
      isEmailVerified: isEmailVerified,
      reloadUser:      reloadUser
    };
  })();

  /* ──────────────────────────────────────────────────────────
     11. SÉCURITÉ — Rate limiting côté client
  ────────────────────────────────────────────────────────── */
  SIS.security = (function () {
    var _actions = {};

    /* Empêcher le spam d'actions (ex: envoyer trop de posts) */
    function rateLimit(action, maxPerMinute) {
      var now = Date.now();
      var key = action;
      if (!_actions[key]) _actions[key] = [];
      /* Purger les vieux timestamps */
      _actions[key] = _actions[key].filter(function (ts) { return now - ts < 60000; });
      if (_actions[key].length >= (maxPerMinute || 10)) {
        return false; /* Bloqué */
      }
      _actions[key].push(now);
      return true;
    }

    /* Sanitiser le HTML (éviter XSS) */
    function sanitizeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    /* Valider un pseudo */
    function isValidPseudo(pseudo) {
      return /^[a-zA-Z0-9_\-.]{3,24}$/.test(pseudo);
    }

    /* Valider un email */
    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /* Vérifier si un user est banni */
    function isBanned(uid) {
      return SIS.db.collection('users').doc(uid).get()
        .then(function (doc) {
          return doc.exists && doc.data().banned === true;
        });
    }

    /* Signaler un contenu */
    function report(targetUid, contentId, contentType, reason) {
      if (!SIS.user) return Promise.reject(new Error('Non connecté'));
      if (!rateLimit('report', 5)) {
        return Promise.reject(new Error('Trop de signalements'));
      }

      var batch = SIS.db.batch();

      /* Ajouter le signalement */
      var reportRef = SIS.db.collection('reports').doc();
      batch.set(reportRef, {
        reporterId:   SIS.user.uid,
        targetUid:    targetUid,
        contentId:    contentId,
        contentType:  contentType,
        reason:       reason,
        createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
        resolved:     false
      });

      /* Incrémenter le compteur de signalements du contenu */
      var contentRef = SIS.db.collection(contentType).doc(contentId);
      batch.update(contentRef, {
        reportCount: firebase.firestore.FieldValue.increment(1)
      });

      return batch.commit().then(function () {
        /* Vérifier si auto-ban (3+ signalements) */
        return SIS.db.collection(contentType).doc(contentId).get();
      }).then(function (doc) {
        if (doc.exists && (doc.data().reportCount || 0) >= 3) {
          /* Auto-modération */
          return SIS.db.collection(contentType).doc(contentId)
            .update({ hidden: true, autoModerated: true });
        }
      });
    }

    return {
      rateLimit:    rateLimit,
      sanitizeHtml: sanitizeHtml,
      isValidPseudo: isValidPseudo,
      isValidEmail: isValidEmail,
      isBanned:     isBanned,
      report:       report
    };
  })();

  /* ──────────────────────────────────────────────────────────
     12. UTILITAIRES GLOBAUX
  ────────────────────────────────────────────────────────── */
  SIS.utils = (function () {

    /* Échapper HTML */
    function escHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* Formater timestamp Firestore → texte relatif */
    function timeAgo(ts) {
      if (!ts) return '';
      var date = ts.toDate ? ts.toDate() : new Date(ts);
      var diff = Math.floor((Date.now() - date.getTime()) / 1000);

      if (diff < 60)    return 'À l\'instant';
      if (diff < 3600)  return Math.floor(diff / 60)   + 'min';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      if (diff < 604800)return Math.floor(diff / 86400) + 'j';
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    }

    /* Formater nombre → 1k, 1.2M */
    function formatCount(n) {
      if (!n) return '0';
      if (n < 1000)    return String(n);
      if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
      return (n / 1000000).toFixed(1) + 'M';
    }

    /* Pseudonyme → gradient déterministe */
    function pseudoToGradient(pseudo) {
      var gradients = [
        'linear-gradient(135deg,#5B8EF4,#8B5CF6)',
        'linear-gradient(135deg,#f04f5a,#f59e0b)',
        'linear-gradient(135deg,#22d47a,#5B8EF4)',
        'linear-gradient(135deg,#8B5CF6,#f04f5a)',
        'linear-gradient(135deg,#f59e0b,#22d47a)',
        'linear-gradient(135deg,#06b6d4,#8B5CF6)',
        'linear-gradient(135deg,#f04f5a,#8B5CF6)',
        'linear-gradient(135deg,#22d47a,#8B5CF6)'
      ];
      var hash = 0;
      for (var i = 0; i < (pseudo || '').length; i++) {
        hash = pseudo.charCodeAt(i) + ((hash << 5) - hash);
      }
      return gradients[Math.abs(hash) % gradients.length];
    }

    /* Détecter mentions et hashtags dans un texte */
    function parseText(text) {
      return escHtml(text)
        .replace(/@([a-zA-Z0-9_\-.]{3,24})/g,
          '<span class="mention" data-pseudo="$1">@$1</span>')
        .replace(/#([a-zA-Z0-9_\u00C0-\u024F]{2,30})/g,
          '<span class="hashtag" data-tag="$1">#$1</span>');
    }

    /* Tronquer texte */
    function truncate(str, max) {
      if (!str || str.length <= max) return str;
      return str.substring(0, max) + '…';
    }

    /* Copier dans le presse-papier */
    function copyToClipboard(text) {
      if (navigator.clipboard) {
        return navigator.clipboard.writeText(text);
      }
      /* Fallback Android WebView */
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    }

    /* Partager via Web Share API (Android natif) */
    function share(data) {
      if (navigator.share) {
        return navigator.share(data);
      }
      /* Fallback: copier l'URL */
      return copyToClipboard(data.url || data.text || '');
    }

    /* Générer le lien anonyme d'un user */
    function anonLink(pseudo) {
      return 'https://sis-send.vercel.app/index.html?to=' + encodeURIComponent(pseudo);
    }

    /* Détecter la langue du navigateur */
    function detectLang() {
      var lang = navigator.language || 'fr';
      if (lang.startsWith('fr')) return 'fr';
      if (lang.startsWith('pt')) return 'pt';
      return 'en';
    }

    /* Générer un ID unique côté client */
    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }

    /* Deep debounce */
    function debounce(fn, delay) {
      var timer;
      return function () {
        var args = arguments;
        var ctx = this;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
      };
    }

    /* Throttle */
    function throttle(fn, limit) {
      var last = 0;
      return function () {
        var now = Date.now();
        if (now - last >= limit) {
          last = now;
          fn.apply(this, arguments);
        }
      };
    }

    return {
      escHtml:          escHtml,
      timeAgo:          timeAgo,
      formatCount:      formatCount,
      pseudoToGradient: pseudoToGradient,
      parseText:        parseText,
      truncate:         truncate,
      copyToClipboard:  copyToClipboard,
      share:            share,
      anonLink:         anonLink,
      detectLang:       detectLang,
      uid:              uid,
      debounce:         debounce,
      throttle:         throttle
    };
  })();

  /* ──────────────────────────────────────────────────────────
     13. BOTTOM NAV — Injection dans toutes les pages
  ────────────────────────────────────────────────────────── */
  SIS.renderBottomNav = function (activePage) {
    var items = [
      {
        id: 'profil',
        label: { fr: 'Profil', en: 'Profile', pt: 'Perfil' },
        href: 'profil.html',
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>'
      },
      {
        id: 'decouvrir',
        label: { fr: 'Découvrir', en: 'Explore', pt: 'Explorar' },
        href: 'decouvrir.html',
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>'
      },
      {
        id: 'post',
        isPost: true,
        label: { fr: '', en: '', pt: '' },
        href: '#',
        svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      },
      {
        id: 'chat',
        label: { fr: 'Chat', en: 'Chat', pt: 'Chat' },
        href: 'chat.html',
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      },
      {
        id: 'notifs',
        label: { fr: 'Notifs', en: 'Notifs', pt: 'Notifs' },
        href: 'notifs.html',
        badge: true,
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      },
      {
        id: 'anon',
        label: { fr: 'Anonyme', en: 'Anon', pt: 'Anon' },
        href: 'https://sis-say-it-safely-pi.vercel.app/voir.html',
        badge: true,
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      }
    ];

    var lang = SIS.utils.detectLang();

    var html = '<nav class="bnav" id="bnav">';

    items.forEach(function (item) {
      if (item.isPost) {
        html += '<div class="bnav-post" id="bnav-post">' +
          '<div class="bnav-post-btn">' + item.svg + '</div>' +
          '</div>';
        return;
      }

      var isActive = activePage === item.id;
      var strokeColor = isActive ? 'url(#bnavGrad)' : 'currentColor';

      html += '<a class="bnav-item' + (isActive ? ' active' : '') + '" href="' + item.href + '" id="bnav-' + item.id + '">' +
        item.svg.replace('stroke="currentColor"', 'stroke="' + strokeColor + '"') +
        (item.label[lang] ? '<span>' + item.label[lang] + '</span>' : '') +
        (item.badge ? '<span class="nav-badge bnav-' + item.id + '-badge" style="display:none">0</span>' : '') +
        '</a>';
    });

    html += '</nav>';

    /* SVG gradient pour icône active */
    html += '<svg width="0" height="0" style="position:absolute;overflow:hidden">' +
      '<defs>' +
      '<linearGradient id="bnavGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#5B8EF4"/>' +
      '<stop offset="100%" stop-color="#8B5CF6"/>' +
      '</linearGradient>' +
      '</defs></svg>';

    return html;
  };

  /* Injecter le bottom nav dans la page */
  SIS.injectBottomNav = function (activePage) {
    /* Injecter via innerHTML — compatible tous Android WebView */
    var tmp = document.createElement('div');
    tmp.innerHTML = SIS.renderBottomNav(activePage);
    var navEl = tmp.querySelector('#bnav');

    /* Remplacer ou ajouter le nav */
    var existing = document.getElementById('bnav');
    if (existing && navEl) {
      existing.parentNode.replaceChild(navEl, existing);
    } else if (navEl) {
      document.body.appendChild(navEl);
    }

    /* Injecter le SVG defs gradient UNE seule fois */
    if (!document.getElementById('bnavGrad')) {
      var svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgDefs.setAttribute('width', '0');
      svgDefs.setAttribute('height', '0');
      svgDefs.style.cssText = 'position:absolute;overflow:hidden;width:0;height:0';
      svgDefs.innerHTML =
        '<defs>' +
        '<linearGradient id="bnavGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" stop-color="#5B8EF4"/>' +
        '<stop offset="100%" stop-color="#8B5CF6"/>' +
        '</linearGradient>' +
        '</defs>';
      document.body.insertBefore(svgDefs, document.body.firstChild);
    }

    /* Écouter le bouton post */
    var postBtn = document.getElementById('bnav-post');
    if (postBtn) {
      postBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof SIS.onPostClick === 'function') SIS.onPostClick();
      });
    }
  };

  /* ──────────────────────────────────────────────────────────
     14. THEME MANAGER (clair/sombre)
  ────────────────────────────────────────────────────────── */
  SIS.theme = (function () {
    var current = 'dark';

    function apply(theme) {
      current = theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('sis_theme', theme);
    }

    function load() {
      var saved = localStorage.getItem('sis_theme');
      /* Respecter la préférence système si pas de préférence sauvée */
      if (!saved) {
        saved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      apply(saved);
      return saved;
    }

    function toggle() {
      apply(current === 'dark' ? 'light' : 'dark');
      /* Sauvegarder dans profil si connecté */
      if (SIS.user) {
        SIS.db.collection('users').doc(SIS.user.uid)
          .update({ theme: current })
          .catch(function () {});
      }
    }

    return { apply: apply, load: load, toggle: toggle, get: function () { return current; } };
  })();

  /* ──────────────────────────────────────────────────────────
     15. INTERNATIONALISATION (FR/EN/PT)
  ────────────────────────────────────────────────────────── */
  SIS.i18n = (function () {
    var _lang = 'fr';

    var strings = {
      fr: {
        loading:        'Chargement...',
        error_network:  'Erreur réseau. Réessaie.',
        error_auth:     'Email ou mot de passe incorrect.',
        error_pseudo:   'Ce pseudo est déjà pris.',
        error_email:    'Email invalide.',
        error_weak_pwd: 'Mot de passe trop faible (min. 8 caractères).',
        verify_email:   'Vérifie ton email pour continuer.',
        post_success:   'Publication envoyée !',
        post_error:     'Erreur lors de la publication.',
        copy_success:   'Lien copié !',
        report_sent:    'Signalement envoyé.',
        follow:         'Suivre',
        unfollow:       'Ne plus suivre',
        send:           'Envoyer',
        cancel:         'Annuler',
        save:           'Sauvegarder',
        confirm:        'Confirmer',
        delete:         'Supprimer',
        edit:           'Modifier',
        share:          'Partager',
        copy_link:      'Copier le lien',
        anon_link:      'Lien anonyme',
        certified:      'Certifié',
        banned_msg:     'Ton compte a été suspendu.',
        pacte_title:    'Le Pacte',
        pacte_sub:      'Réagis à ce post avant de publier',
        pacte_skip:     'Passer (dans 2s)',
        interests_title:'Tes centres d\'intérêt',
        interests_sub:  'Choisis au moins 3 · le feed s\'adapte à toi',
        cgu_title:      'Conditions d\'utilisation',
        cgu_accept:     'J\'ai lu et j\'accepte les CGU et la politique de confidentialité',
        welcome:        'Bienvenue',
        welcome_sub:    'Exprime-toi librement. En sécurité.',
        login:          'Connexion',
        register:       'Inscription',
        forgot_pwd:     'Mot de passe oublié ?',
        or:             'ou',
        continue_anon:  'Continuer anonymement',
        email_sent:     'Email envoyé ! Vérifie ta boîte (et spam).',
        pseudo_label:   'Pseudo',
        email_label:    'Email',
        pwd_label:      'Mot de passe',
        create_account: 'Créer mon compte',
        sign_in:        'Se connecter'
      },
      en: {
        loading:        'Loading...',
        error_network:  'Network error. Try again.',
        error_auth:     'Wrong email or password.',
        error_pseudo:   'This username is taken.',
        error_email:    'Invalid email.',
        error_weak_pwd: 'Password too weak (min. 8 chars).',
        verify_email:   'Check your email to continue.',
        post_success:   'Post published!',
        post_error:     'Error publishing post.',
        copy_success:   'Link copied!',
        report_sent:    'Report sent.',
        follow:         'Follow',
        unfollow:       'Unfollow',
        send:           'Send',
        cancel:         'Cancel',
        save:           'Save',
        confirm:        'Confirm',
        delete:         'Delete',
        edit:           'Edit',
        share:          'Share',
        copy_link:      'Copy link',
        anon_link:      'Anonymous link',
        certified:      'Certified',
        banned_msg:     'Your account has been suspended.',
        pacte_title:    'The Pact',
        pacte_sub:      'React to this post before publishing',
        pacte_skip:     'Skip (in 2s)',
        interests_title:'Your interests',
        interests_sub:  'Choose at least 3 · feed adapts to you',
        cgu_title:      'Terms of use',
        cgu_accept:     'I have read and accept the ToS and privacy policy',
        welcome:        'Welcome',
        welcome_sub:    'Express yourself freely. Safely.',
        login:          'Login',
        register:       'Sign up',
        forgot_pwd:     'Forgot password?',
        or:             'or',
        continue_anon:  'Continue anonymously',
        email_sent:     'Email sent! Check your inbox (and spam).',
        pseudo_label:   'Username',
        email_label:    'Email',
        pwd_label:      'Password',
        create_account: 'Create account',
        sign_in:        'Sign in'
      },
      pt: {
        loading:        'Carregando...',
        error_network:  'Erro de rede. Tente novamente.',
        error_auth:     'Email ou senha incorretos.',
        error_pseudo:   'Este pseudônimo já está em uso.',
        error_email:    'Email inválido.',
        error_weak_pwd: 'Senha fraca (mín. 8 caracteres).',
        verify_email:   'Verifique seu email para continuar.',
        post_success:   'Publicação enviada!',
        post_error:     'Erro ao publicar.',
        copy_success:   'Link copiado!',
        report_sent:    'Denúncia enviada.',
        follow:         'Seguir',
        unfollow:       'Deixar de seguir',
        send:           'Enviar',
        cancel:         'Cancelar',
        save:           'Salvar',
        confirm:        'Confirmar',
        delete:         'Excluir',
        edit:           'Editar',
        share:          'Compartilhar',
        copy_link:      'Copiar link',
        anon_link:      'Link anônimo',
        certified:      'Certificado',
        banned_msg:     'Sua conta foi suspensa.',
        pacte_title:    'O Pacto',
        pacte_sub:      'Reaja a este post antes de publicar',
        pacte_skip:     'Pular (em 2s)',
        interests_title:'Seus interesses',
        interests_sub:  'Escolha pelo menos 3 · o feed se adapta a você',
        cgu_title:      'Termos de uso',
        cgu_accept:     'Li e aceito os Termos de Uso e a Política de Privacidade',
        welcome:        'Bem-vindo',
        welcome_sub:    'Expresse-se livremente. Com segurança.',
        login:          'Entrar',
        register:       'Cadastrar',
        forgot_pwd:     'Esqueceu a senha?',
        or:             'ou',
        continue_anon:  'Continuar anonimamente',
        email_sent:     'Email enviado! Verifique sua caixa (e spam).',
        pseudo_label:   'Pseudônimo',
        email_label:    'Email',
        pwd_label:      'Senha',
        create_account: 'Criar conta',
        sign_in:        'Entrar'
      }
    };

    function t(key) {
      return (strings[_lang] && strings[_lang][key]) || strings.fr[key] || key;
    }

    function setLang(lang) {
      if (strings[lang]) {
        _lang = lang;
        localStorage.setItem('sis_lang', lang);
      }
    }

    function loadLang() {
      var saved = localStorage.getItem('sis_lang') || SIS.utils.detectLang();
      setLang(saved);
      return saved;
    }

    return { t: t, setLang: setLang, loadLang: loadLang, get: function () { return _lang; } };
  })();

  /* ──────────────────────────────────────────────────────────
     16. POPUP PROFIL — Logique universelle
  ────────────────────────────────────────────────────────── */
  SIS.profilePopup = (function () {
    var _overlay = null;

    function show(pseudo, options) {
      /* options: { certified, bio, followers, photoUrl, isFollowing } */
      options = options || {};

      /* Si pas d'infos, aller chercher dans Firestore */
      if (!options._loaded) {
        SIS.db.collection('users').where('pseudo', '==', pseudo).limit(1).get()
          .then(function (snap) {
            if (!snap.empty) {
              var data = snap.docs[0].data();
              show(pseudo, Object.assign({ _loaded: true }, data, options));
            }
          });
        /* Afficher un squelette en attendant */
        _render(pseudo, { _loading: true });
        return;
      }

      _render(pseudo, options);
    }

    function _render(pseudo, opts) {
      close(); /* Fermer si déjà ouvert */

      var lang = SIS.i18n.get();
      var anonLink = SIS.utils.anonLink(pseudo);
      var gradient = SIS.utils.pseudoToGradient(pseudo);

      /* isMe: comparaison simple avec le pseudo du user connecté */
      var isMe = SIS.user && opts.pseudo === pseudo && SIS.user.uid === opts.uid;

      var overlay = document.createElement('div');
      overlay.className = 'profile-popup-overlay';
      overlay.id = 'pp-overlay';

      overlay.innerHTML =
        '<div class="profile-popup" id="pp-card">' +
          '<div class="pp-cover">' +
            '<button class="pp-close-btn" id="pp-close">' +
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">' +
              '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="pp-av-row">' +
            (opts._loading
              ? '<div class="skeleton skeleton-circle av-md"></div>'
              : SIS.renderAvatar({
                  photoUrl:  opts.photoUrl || null,
                  pseudo:    pseudo,
                  certified: opts.certified || false,
                  size:      'md',
                  gradient:  gradient
                })
            ) +
            (!opts._loading
              ? '<button class="btn-primary btn-sm" id="pp-follow-btn" style="width:auto">' +
                  (opts.isFollowing
                    ? SIS.i18n.t('unfollow')
                    : SIS.i18n.t('follow')) +
                '</button>'
              : '') +
          '</div>' +
          '<div class="pp-info">' +
            (opts._loading
              ? '<div class="skeleton" style="width:140px;height:18px;margin-bottom:6px"></div>' +
                '<div class="skeleton" style="width:200px;height:14px"></div>'
              : '<div class="pp-name">' + SIS.utils.escHtml(pseudo) +
                  (opts.certified
                    ? ' <svg width="14" height="14" viewBox="0 0 24 24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#bnavGrad)"/></svg>'
                    : '') +
                '</div>' +
                '<div class="pp-bio">' + SIS.utils.escHtml(opts.bio || '') +
                  (opts.followers ? '<br><span class="text-muted text-xs">' + SIS.utils.formatCount(opts.followers) + ' abonnés</span>' : '') +
                '</div>'
            ) +
          '</div>' +
          '<div class="pp-sis-link">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            '<a href="' + anonLink + '" target="_blank">' + anonLink + '</a>' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="flex-shrink:0;cursor:pointer" id="pp-copy-link"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '</div>' +
          '<div class="pp-actions">' +
            '<button class="pp-btn-dm" id="pp-dm-btn">💬 Message</button>' +
            '<button class="pp-btn-follow ' + (opts.isFollowing ? 'active' : '') + '" id="pp-follow-btn2">' +
              (opts.isFollowing ? '✓ ' + SIS.i18n.t('unfollow') : '➕ ' + SIS.i18n.t('follow')) +
            '</button>' +
            '<button class="pp-btn-anon" id="pp-anon-btn" title="Envoyer message anonyme">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      _overlay = overlay;

      /* Attacher les handlers */
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });

      var closeBtn = overlay.querySelector('#pp-close');
      if (closeBtn) closeBtn.addEventListener('click', close);

      var copyBtn = overlay.querySelector('#pp-copy-link');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          SIS.utils.copyToClipboard(anonLink)
            .then(function () { SIS.toast.success(SIS.i18n.t('copy_success')); });
        });
      }

      var dmBtn = overlay.querySelector('#pp-dm-btn');
      if (dmBtn) {
        dmBtn.addEventListener('click', function () {
          window.location.href = 'chat.html?dm=' + encodeURIComponent(pseudo);
        });
      }

      var anonBtn = overlay.querySelector('#pp-anon-btn');
      if (anonBtn) {
        anonBtn.addEventListener('click', function () {
          window.open(anonLink, '_blank');
        });
      }

      SIS.bindAvatarClicks(overlay);
    }

    function close() {
      if (_overlay && _overlay.parentNode) {
        _overlay.parentNode.removeChild(_overlay);
        _overlay = null;
      }
    }

    return { show: show, close: close };
  })();

  /* ──────────────────────────────────────────────────────────
     17. REACTION STORM (animation SVG particules)
  ────────────────────────────────────────────────────────── */
  SIS.reactionStorm = function (emoji, x, y) {
    var container = document.getElementById('reaction-storm');
    if (!container) {
      container = document.createElement('div');
      container.id = 'reaction-storm';
      container.className = 'reaction-storm';
      document.body.appendChild(container);
    }

    var count = 12;
    for (var i = 0; i < count; i++) {
      (function (index) {
        var particle = document.createElement('div');
        particle.textContent = emoji;
        var angle  = (index / count) * 360;
        var dist   = 60 + Math.random() * 80;
        var rad    = (angle * Math.PI) / 180;
        var tx     = Math.cos(rad) * dist;
        var ty     = Math.sin(rad) * dist;
        var size   = 14 + Math.random() * 12;
        var delay  = Math.random() * 150;

        particle.style.cssText = [
          'position:absolute',
          'left:' + (x - size / 2) + 'px',
          'top:'  + (y - size / 2) + 'px',
          'font-size:' + size + 'px',
          'pointer-events:none',
          'user-select:none',
          'animation:storm ' + (600 + Math.random() * 400) + 'ms ease-out ' + delay + 'ms both',
          '--tx:' + tx + 'px',
          '--ty:' + ty + 'px'
        ].join(';');

        container.appendChild(particle);
        setTimeout(function () {
          if (particle.parentNode) particle.parentNode.removeChild(particle);
        }, 1200 + delay);
      })(i);
    }

    /* Injecter le keyframe si pas encore fait */
    if (!document.getElementById('storm-style')) {
      var style = document.createElement('style');
      style.id = 'storm-style';
      style.textContent = '@keyframes storm{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--tx),var(--ty)) scale(0.3)}}';
      document.head.appendChild(style);
    }
  };

  /* ──────────────────────────────────────────────────────────
     18. INIT GLOBALE — Point d'entrée
  ────────────────────────────────────────────────────────── */
  SIS.init = function (options) {
    options = options || {};

    /* Charger thème et langue */
    SIS.theme.load();
    SIS.i18n.loadLang();

    /* Initialiser Firebase */
    SIS.initFirebase();

    /* Injecter le bottom nav si demandé */
    if (options.page) {
      SIS.injectBottomNav(options.page);
    }

    /* Quand l'auth est prête */
    SIS.onAuthReady(function (user) {
      if (user) {
        /* Présence en ligne */
        SIS.authHelper.setPresence(user.uid);
        /* Écouter les notifs */
        SIS.notifs.listen(user.uid);
        /* Charger le thème du profil */
        SIS.db.collection('users').doc(user.uid).get().then(function (doc) {
          if (doc.exists) {
            var data = doc.data();
            if (data.theme) SIS.theme.apply(data.theme);
            if (data.lang)  SIS.i18n.setLang(data.lang);
            /* Vérif ban */
            if (data.banned) {
              SIS.toast.error(SIS.i18n.t('banned_msg'));
              SIS.authHelper.logout();
              window.location.href = 'auth.html';
            }
          }
        }).catch(function () {});

        /* Appeler le callback page-specific */
        if (typeof options.onReady === 'function') options.onReady(user);
      } else {
        /* Pas connecté */
        if (options.requireAuth && window.location.pathname.indexOf('auth.html') === -1) {
          window.location.href = 'auth.html';
        }
        if (typeof options.onGuest === 'function') options.onGuest();
      }
    });
  };

  /* ──────────────────────────────────────────────────────────
     Exposer SIS globalement
  ────────────────────────────────────────────────────────── */
})(window.SIS = window.SIS || {});
