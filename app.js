/* ============================================================
   SIS V2 — app.js
   Say It Safely · Logique métier par page
   Auteur: gbaguidiexauce
   Stack : Vanilla JS IIFE, Firebase Compat 9.23.0
   RÈGLE : Pas d'ES6 modules, pas de type="module"
   ============================================================ */

(function () {
  'use strict';

  /* Page courante — lue une fois */
  var PAGE = document.body.getAttribute('data-page') || '';

  /* Bootstrap — appelé tout en bas après toutes les déclarations */
  function bootstrap() {
    /* FIX: aucune protection n'existait ici. Si SIS.initFirebase() (ou toute
       autre étape) levait une exception (ex: SDK Firebase non chargé), le
       script s'arrêtait net, en silence : ni bottom nav, ni connexion, ni
       aucune fonctionnalité de la page, sans le moindre message. */
    try {
      SIS.theme.load();
      SIS.i18n.loadLang();
      SIS.initFirebase();

      switch (PAGE) {
        case 'auth':      AuthModule.init();      break;
        case 'feed':      FeedModule.init();      break;
        case 'profil':    ProfilModule.init();    break;
        case 'notifs':    NotifsModule.init();    break;
        default: break;
      }
    } catch (e) {
      console.error('SIS bootstrap error:', e);
      if (SIS.showFatalError) {
        SIS.showFatalError(
          'Une erreur est survenue',
          'L\'application n\'a pas pu démarrer correctement. Rechargez la page ; ' +
          'si le problème persiste, vérifiez votre connexion internet.'
        );
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     MODULE AUTH
  ══════════════════════════════════════════════════════════ */
  var AuthModule = (function () {

    /* ── État interne ── */
    var state = {
      currentScreen:   'auth',   /* auth | profile-setup | link-reveal */
      authMode:        'login',    /* login | register */
      regStep:         1,          /* 1 | 2 | 3 */
      regEmail:        '',
      regPseudo:       '',
      cguAccepted:     false,
      avatarPublicId:  null,
      pendingUser:     null,       /* user Firebase en attente de complétion */
      /* FIX: voir checkExistingSession() — empêche ce watcher global
         d'interférer (déconnexion / changement d'écran intempestif) pendant
         qu'une inscription est activement en cours sur cette page. */
      registrationInProgress: false,
      pseudoCheckTimer: null,
      resendCooldown:  false
    };

    /* ── Éléments DOM ── */
    var el = {};

    function cacheElements() {
      /* Screens */
      el.screenAuth    = document.getElementById('screen-auth');
      el.screenSetup   = document.getElementById('screen-profile-setup');
      el.screenReveal  = document.getElementById('screen-link-reveal');

      /* Auth tabs */
      el.tabLogin      = document.getElementById('tab-login');
      el.tabRegister   = document.getElementById('tab-register');
      el.formLogin     = document.getElementById('form-login');
      el.formRegister  = document.getElementById('form-register');

      /* Login */
      el.loginEmail    = document.getElementById('login-email');
      el.loginPwd      = document.getElementById('login-pwd');
      el.btnLogin      = document.getElementById('btn-login');
      el.btnForgot     = document.getElementById('btn-forgot');
      el.btnAnon       = document.getElementById('btn-anon');
      el.toggleLoginPwd= document.getElementById('toggle-login-pwd');

      /* Register */
      el.regPseudo     = document.getElementById('reg-pseudo');
      el.regEmail      = document.getElementById('reg-email');
      el.regPwd        = document.getElementById('reg-pwd');
      el.regPwd2       = document.getElementById('reg-pwd2');
      el.pseudoStatus  = document.getElementById('pseudo-status');
      el.pwd2Status    = document.getElementById('pwd2-status');
      el.regStep1      = document.getElementById('reg-step-1');
      el.regStep2      = document.getElementById('reg-step-2');
      el.regStep3      = document.getElementById('reg-step-3');
      el.btnRegStep1   = document.getElementById('btn-reg-step1');
      el.btnEmailConfirmed = document.getElementById('btn-email-confirmed');
      el.btnResendEmail= document.getElementById('btn-resend-email');
      el.btnRegStep3   = document.getElementById('btn-reg-step3');
      el.regEmailDisplay = document.getElementById('reg-email-display');
      el.pwdStrengthFill = document.getElementById('pwd-strength-fill');
      el.pwdStrengthLabel= document.getElementById('pwd-strength-label');
      el.toggleRegPwd  = document.getElementById('toggle-reg-pwd');

      /* Profile setup */
      el.avatarUploadZone = document.getElementById('avatar-upload-zone');
      el.avatarInput   = document.getElementById('avatar-input');
      el.avatarPreview = document.getElementById('avatar-preview');
      el.avatarImg     = document.getElementById('avatar-img');
      el.avatarInitials= document.getElementById('avatar-initials');
      el.uploadProgress= document.getElementById('upload-progress');
      el.uploadProgressFill = document.getElementById('upload-progress-fill');
      el.uploadProgressLabel = document.getElementById('upload-progress-label');
      el.btnSkipSetup  = document.getElementById('btn-skip-setup');
      el.btnGoFeed     = document.getElementById('btn-go-feed');

      /* Link reveal */
      el.revealLinkText = document.getElementById('reveal-link-text');
      el.btnRevealShare  = document.getElementById('btn-reveal-share');
      el.btnEnterApp     = document.getElementById('btn-enter-app');

      /* CGU */
      el.cguOverlay    = document.getElementById('cgu-overlay');
      el.cguCheckBox   = document.getElementById('cgu-check-box');
      el.cguCheckLabel = document.getElementById('cgu-check-label');
      el.btnCguAccept  = document.getElementById('btn-cgu-accept');

      /* Forgot */
      el.forgotOverlay = document.getElementById('forgot-overlay');
      el.forgotEmail   = document.getElementById('forgot-email');
      el.btnForgotSend = document.getElementById('btn-forgot-send');
      el.btnForgotCancel = document.getElementById('btn-forgot-cancel');

      /* Loader */
      el.loader        = document.getElementById('global-loader');

      /* Lang switcher */
      el.langOpts      = document.querySelectorAll('.lang-opt');
    }

    /* ── Navigation entre screens ── */
    function showScreen(name) {
      var screens = {
        auth:           el.screenAuth,
        'profile-setup':el.screenSetup,
        'link-reveal':  el.screenReveal
      };

      /* Sortie de l'écran actuel */
      var current = screens[state.currentScreen];
      if (current) {
        current.classList.remove('active');
        current.classList.add('exit-left');
        setTimeout(function () {
          current.classList.remove('exit-left');
        }, 380);
      }

      state.currentScreen = name;

      /* Entrée du nouvel écran */
      var next = screens[name];
      if (next) {
        setTimeout(function () {
          next.classList.add('active');
          next.scrollTop = 0;
        }, 20);
      }
    }

    /* ── Switcher tab login/register ── */
    function switchTab(tab) {
      state.authMode = tab;
      el.tabLogin.classList.toggle('active', tab === 'login');
      el.tabRegister.classList.toggle('active', tab === 'register');
      el.formLogin.classList.toggle('active', tab === 'login');
      el.formRegister.classList.toggle('active', tab === 'register');

      /* Reset register steps */
      if (tab === 'register') {
        showRegStep(1);
      }
    }

    /* ── Étapes inscription ── */
    function showRegStep(step) {
      state.regStep = step;
      el.regStep1.style.display = step === 1 ? 'block' : 'none';
      el.regStep2.style.display = step === 2 ? 'block' : 'none';
      el.regStep3.style.display = step === 3 ? 'block' : 'none';
    }

    /* ── Vérification pseudo en temps réel ── */
    function checkPseudo(pseudo) {
      clearTimeout(state.pseudoCheckTimer);
      el.pseudoStatus.className = 'input-status';
      el.pseudoStatus.textContent = '';

      if (pseudo.length < 3) return;

      if (!SIS.security.isValidPseudo(pseudo)) {
        el.pseudoStatus.textContent = '✕';
        el.pseudoStatus.className = 'input-status err';
        return;
      }

      /* Debounce 600ms avant de requêter Firestore */
      state.pseudoCheckTimer = setTimeout(function () {
        SIS.db.collection('users')
          .where('pseudo', '==', pseudo)
          .limit(1)
          .get()
          .then(function (snap) {
            if (snap.empty) {
              el.pseudoStatus.textContent = '✓';
              el.pseudoStatus.className = 'input-status ok';
            } else {
              el.pseudoStatus.textContent = '✕';
              el.pseudoStatus.className = 'input-status err';
            }
          })
          .catch(function () {});
      }, 600);
    }

    /* ── Force mot de passe ── */
    function checkPwdStrength(pwd) {
      var score = 0;
      if (pwd.length >= 8)  score++;
      if (pwd.length >= 12) score++;
      if (/[A-Z]/.test(pwd)) score++;
      if (/[0-9]/.test(pwd)) score++;
      if (/[^A-Za-z0-9]/.test(pwd)) score++;

      var level, label, color;
      if (score <= 1) { level = 'weak';   label = 'Faible';  color = 'var(--red)';   }
      else if (score <= 3) { level = 'medium'; label = 'Moyen';  color = 'var(--gold)';  }
      else                 { level = 'strong'; label = 'Fort';   color = 'var(--green)'; }

      el.pwdStrengthFill.className = 'pwd-strength-fill ' + level;
      el.pwdStrengthLabel.textContent = label;
      el.pwdStrengthLabel.style.color = color;
    }

    /* ── Loader ── */
    function setLoading(on) {
      el.loader.style.display = on ? 'flex' : 'none';
    }

    /* ── Erreur Firebase → message lisible ── */
    function parseFirebaseError(err) {
      var map = {
        'auth/user-not-found':       SIS.i18n.t('error_auth'),
        'auth/wrong-password':       SIS.i18n.t('error_auth'),
        'auth/invalid-credential':   SIS.i18n.t('error_auth'),
        'auth/email-already-in-use': 'Cet email est déjà utilisé.',
        'auth/invalid-email':        SIS.i18n.t('error_email'),
        'auth/weak-password':        SIS.i18n.t('error_weak_pwd'),
        'auth/network-request-failed': SIS.i18n.t('error_network'),
        'auth/too-many-requests':    'Trop de tentatives. Réessaie plus tard.'
      };
      return map[err.code] || (err.message || SIS.i18n.t('error_network'));
    }

    /* ── Afficher CGU ── */
    function showCGU(onAccept) {
      el.cguOverlay.style.display = 'flex';
      state._cguCallback = onAccept;
    }

    function hideCGU() {
      el.cguOverlay.style.display = 'none';
    }

    /* ── CONNEXION ── */
    function handleLogin() {
      var email = el.loginEmail.value.trim();
      var pwd   = el.loginPwd.value;

      if (!email || !pwd) {
        SIS.toast.error('Champs manquants', 'Remplis tous les champs.');
        return;
      }

      if (!SIS.security.isValidEmail(email)) {
        SIS.toast.error('Email invalide');
        return;
      }

      if (!state.cguAccepted) {
        showCGU(function () { handleLogin(); });
        return;
      }

      setLoading(true);
      SIS.authHelper.login(email, pwd)
        .then(function (cred) {
          /* Vérif email confirmé */
          if (!cred.user.emailVerified) {
            SIS.toast.warning('Email non vérifié', SIS.i18n.t('verify_email'));
            cred.user.sendEmailVerification();
            setLoading(false);
            return;
          }
          /* Plus de vérif "profil complet" basée sur interests (fonctionnalité
             retirée) — connexion réussie + email vérifié suffit désormais. */
          setLoading(false);
          window.location.href = 'feed.html';
        })
        .catch(function (err) {
          setLoading(false);
          SIS.toast.error('Connexion échouée', parseFirebaseError(err));
        });
    }

    /* ── ÉTAPE 1 INSCRIPTION : pseudo + email ── */
    function handleRegStep1() {
      var pseudo = el.regPseudo.value.trim();
      var email  = el.regEmail.value.trim();

      if (!pseudo || !email) {
        SIS.toast.error('Champs manquants', 'Remplis tous les champs.');
        return;
      }

      if (!SIS.security.isValidPseudo(pseudo)) {
        SIS.toast.error('Pseudo invalide', '3–24 caractères alphanumériques.');
        return;
      }

      if (!SIS.security.isValidEmail(email)) {
        SIS.toast.error(SIS.i18n.t('error_email'));
        return;
      }

      /* Vérifier unicité pseudo */
      setLoading(true);
      SIS.db.collection('users')
        .where('pseudo', '==', pseudo)
        .limit(1)
        .get()
        .then(function (snap) {
          if (!snap.empty) {
            setLoading(false);
            SIS.toast.error(SIS.i18n.t('error_pseudo'));
            return;
          }

          state.regPseudo = pseudo;
          state.regEmail  = email;

          /* Afficher CGU avant d'aller plus loin */
          if (!state.cguAccepted) {
            setLoading(false);
            showCGU(function () { proceedReg1(); });
            return;
          }
          proceedReg1();
        })
        .catch(function () {
          setLoading(false);
          SIS.toast.error(SIS.i18n.t('error_network'));
        });
    }

    /* Créer le compte Firebase (sans mot de passe encore) et envoyer l'email de vérif */
    function proceedReg1() {
      setLoading(true);
      state.registrationInProgress = true;

      /* On crée un compte temporaire avec un mdp aléatoire fort,
         puis on demandera le vrai mdp après vérif email */
      var tempPwd = SIS.utils.uid() + 'Aa1!';

      firebase.auth().createUserWithEmailAndPassword(state.regEmail, tempPwd)
        .then(function (cred) {
          state.pendingUser = cred.user;

          /* Envoyer email de vérification */
          return cred.user.sendEmailVerification()
            .then(function () {
              /* Créer profil minimal en Firestore */
              return SIS.db.collection('users').doc(cred.user.uid).set({
                uid:        cred.user.uid,
                pseudo:     state.regPseudo,
                /* FIX BUG CONFIRMÉ: la recherche utilisateur ('>=' / '<=' sur
                   pseudo) est sensible à la casse côté Firestore — chercher
                   "alex" ne trouve jamais "Alexandre". On stocke une version
                   minuscule dédiée à la recherche. */
                pseudoLower: state.regPseudo.toLowerCase(),
                email:      state.regEmail,
                photoUrl:   null,
                bio:        '',
                certified:  false,
                interests:  [],
                followers:  0,
                following:  0,
                postsCount: 0,
                createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen:   firebase.firestore.FieldValue.serverTimestamp(),
                theme:      'dark',
                lang:       SIS.i18n.get(),
                isAnon:     false,
                banned:     false,
                reportCount: 0,
                /* BUG-13 fix: tempPwd non stocké en Firestore pour sécurité */
              });
            });
        })
        .then(function () {
          setLoading(false);
          el.regEmailDisplay.textContent = state.regEmail;
          showRegStep(2);
          SIS.toast.success('Email envoyé !', SIS.i18n.t('email_sent'));
        })
        .catch(function (err) {
          setLoading(false);
          state.registrationInProgress = false; /* échec -> ne pas bloquer une connexion normale ensuite */
          SIS.toast.error('Erreur', parseFirebaseError(err));
        });
    }

    /* ── ÉTAPE 2 : vérification email confirmée ── */
    function handleEmailConfirmed() {
      if (!state.pendingUser) return;

      setLoading(true);
      state.pendingUser.reload()
        .then(function () {
          setLoading(false);
          if (state.pendingUser.emailVerified) {
            showRegStep(3);
          } else {
            SIS.toast.warning(
              'Email non confirmé',
              'Clique sur le lien dans ton email. Vérifie aussi tes spams.'
            );
          }
        })
        .catch(function () {
          setLoading(false);
          SIS.toast.error(SIS.i18n.t('error_network'));
        });
    }

    /* ── ÉTAPE 3 : choisir le vrai mot de passe ── */
    function handleRegStep3() {
      var pwd  = el.regPwd.value;
      var pwd2 = el.regPwd2.value;

      if (pwd.length < 8) {
        SIS.toast.error(SIS.i18n.t('error_weak_pwd'));
        return;
      }

      if (pwd !== pwd2) {
        SIS.toast.error('Mots de passe différents', 'Les deux mots de passe ne correspondent pas.');
        el.pwd2Status.textContent = '✕';
        el.pwd2Status.className = 'input-status err';
        return;
      }

      if (!state.pendingUser) {
        SIS.toast.error(SIS.i18n.t('error_network'));
        return;
      }

      setLoading(true);

      /* Mettre à jour le mot de passe Firebase */
      state.pendingUser.updatePassword(pwd)
        .then(function () {
          /* Supprimer le tempPwd du profil Firestore */
          return SIS.db.collection('users').doc(state.pendingUser.uid)
            .update({
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function () {
          setLoading(false);
          state.registrationInProgress = false; /* inscription terminée, compte complet */
          SIS.toast.success('Compte créé !', 'Bienvenue sur SIS 🎉');
          showScreen('profile-setup');
        })
        .catch(function (err) {
          setLoading(false);
          SIS.toast.error('Erreur', parseFirebaseError(err));
        });
    }

    /* ── CONNEXION ANONYME ── */
    function handleAnon() {
      if (!state.cguAccepted) {
        showCGU(function () { handleAnon(); });
        return;
      }

      setLoading(true);
      SIS.authHelper.loginAnon(function (pseudo) {
        setLoading(false);
        SIS.toast.success('Bienvenue !', 'Ton pseudo : ' + pseudo);
        showScreen('profile-setup');
      }).catch(function () {
        setLoading(false);
        SIS.toast.error(SIS.i18n.t('error_network'));
      });
    }

    /* ── RÉINITIALISER MOT DE PASSE ── */
    function handleForgot() {
      var email = el.forgotEmail.value.trim();
      if (!SIS.security.isValidEmail(email)) {
        SIS.toast.error(SIS.i18n.t('error_email'));
        return;
      }

      setLoading(true);
      SIS.authHelper.resetPassword(email)
        .then(function () {
          setLoading(false);
          el.forgotOverlay.style.display = 'none';
          SIS.toast.success('Email envoyé !', 'Vérifie ta boîte mail.');
        })
        .catch(function (err) {
          setLoading(false);
          SIS.toast.error('Erreur', parseFirebaseError(err));
        });
    }

    /* ── UPLOAD PHOTO DE PROFIL ── */
    function handleAvatarChange(file) {
      if (!file || !file.type.startsWith('image/')) return;

      /* Aperçu immédiat */
      var reader = new FileReader();
      reader.onload = function (e) {
        el.avatarImg.src = e.target.result;
        el.avatarImg.style.display = 'block';
        el.avatarInitials.style.display = 'none';
      };
      reader.readAsDataURL(file);

      /* Upload avec compression */
      el.uploadProgress.style.display = 'flex';
      el.uploadProgressFill.style.width = '0%';
      el.uploadProgressLabel.textContent = 'Compression…';

      SIS.image.processAndUpload(
        file,
        { type: 'avatar' },
        function (pct) {
          el.uploadProgressFill.style.width = pct + '%';
          el.uploadProgressLabel.textContent = 'Upload… ' + pct + '%';
        }
      )
      .then(function (result) {
        state.avatarPublicId = result.publicId;
        el.uploadProgress.style.display = 'none';
        SIS.toast.success('Photo uploadée !');
      })
      .catch(function () {
        el.uploadProgress.style.display = 'none';
        SIS.toast.error('Erreur upload', 'Réessaie.');
      });
    }

    /* ── TERMINER SETUP PROFIL ── */
    function handleGoFeed() {
      var uid = state.pendingUser
        ? state.pendingUser.uid
        : (SIS.user ? SIS.user.uid : null);

      if (!uid) {
        showScreen('link-reveal');
        return;
      }

      var updates = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (state.avatarPublicId) updates.photoUrl = state.avatarPublicId;

      setLoading(true);
      SIS.db.collection('users').doc(uid).update(updates)
        .then(function () {
          setLoading(false);
          showLinkReveal(uid);
        })
        .catch(function () {
          setLoading(false);
          showLinkReveal(uid);
        });
    }

    /* ── ÉCRAN FINAL : révéler le lien ──
       Relit le profil depuis Firestore plutôt que de compter sur
       state.regPseudo, qui n'est peuplé que pour le parcours inscription
       classique (pas la connexion anonyme) — fiable quel que soit le
       chemin emprunté pour arriver ici. */
    function showLinkReveal(uid) {
      showScreen('link-reveal');
      if (!uid) return;
      SIS.authHelper.getProfile(uid).then(function (profile) {
        var pseudo = profile ? profile.pseudo : '';
        var link = SIS.utils.anonLink(pseudo);
        state.myAnonLink = link;
        if (el.revealLinkText) el.revealLinkText.textContent = link.replace(/^https?:\/\//, '');
      }).catch(function () {});
    }

    /* ── TOGGLE VISIBILITÉ MOT DE PASSE ── */
    function togglePasswordVisibility(inputEl, btnEl) {
      var isHidden = inputEl.type === 'password';
      inputEl.type = isHidden ? 'text' : 'password';
      btnEl.querySelector('svg').style.opacity = isHidden ? '1' : '0.5';
    }

    /* ── VÉRIFIER SI DÉJÀ CONNECTÉ ── */
    function checkExistingSession() {
      SIS.auth.onAuthStateChanged(function (user) {
        if (!user) return;
        /* FIX: ne JAMAIS interférer (déconnexion, changement d'écran) tant
           qu'une inscription est activement en cours sur cette page — ce
           watcher global se déclenche à chaque changement d'état d'auth
           (création de compte, reload(), updatePassword()...) et clobberait
           sinon les étapes 2/3/4 de l'inscription. */
        if (state.registrationInProgress) return;

        /* User connecté → vérifier si profil complet */
        SIS.db.collection('users').doc(user.uid).get()
          .then(function (doc) {
            if (!doc.exists) {
              /* FIX BUG MAJEUR: la création de compte (proceedReg1) crée
                 d'abord l'utilisateur Firebase Auth (ce qui le CONNECTE
                 automatiquement et déclenche CE listener immédiatement),
                 puis envoie l'email de vérif, PUIS écrit le document
                 Firestore du profil — ces deux dernières étapes prennent un
                 peu de temps. Ce check arrivait donc souvent AVANT que le
                 document existe, et déconnectait l'utilisateur EN PLEIN
                 MILIEU de son inscription ("un truc bizarre" au moment de
                 créer un compte). On laisse maintenant une période de grâce
                 de 30s après la création du compte avant de considérer que
                 c'est un vrai compte fantôme à déconnecter. */
              var createdAtMs = user.metadata && user.metadata.creationTime
                ? new Date(user.metadata.creationTime).getTime()
                : 0;
              var ageMs = Date.now() - createdAtMs;
              if (ageMs < 30000) {
                /* Compte tout juste créé -> on laisse le flux d'inscription
                   (proceedReg1/showRegStep) faire son travail tranquillement. */
                return;
              }
              firebase.auth().signOut();
              return;
            }
            var data = doc.data();

            if (data.banned) {
              SIS.toast.error(SIS.i18n.t('banned_msg'));
              firebase.auth().signOut();
              return;
            }

            /* FIX: Compte fantôme - email non vérifié après création */
            if (!user.isAnonymous && !user.emailVerified) {
              var createdAt = user.metadata && user.metadata.creationTime
                ? new Date(user.metadata.creationTime).getTime()
                : Date.now();
              var age = Date.now() - createdAt;
              /* Si compte créé depuis plus de 24h et email pas vérifié → déconnecter */
              if (age > 86400000) {
                SIS.toast.warning('Email non vérifié', 'Vérifie ta boîte mail ou recrée un compte.');
                firebase.auth().signOut();
                return;
              }
            }

            /* Session valide → feed (plus de vérif "interests", retiré) */
            window.location.href = 'feed.html';
          })
          .catch(function () {});
      });
    }

    /* ── BIND EVENTS ── */
    function bindEvents() {
      /* Lien final (écran reveal) */
      el.btnRevealShare.addEventListener('click', function () {
        if (!state.myAnonLink) return;
        if (navigator.share) {
          navigator.share({ title: 'SIS', text: 'Envoie-moi un message anonyme sur SIS 👀', url: state.myAnonLink }).catch(function(){});
        } else {
          SIS.utils.copyToClipboard(state.myAnonLink);
          SIS.toast.success('Lien copié !');
        }
      });
      el.btnEnterApp.addEventListener('click', function () {
        window.location.href = 'feed.html';
      });

      /* Tabs auth */
      el.tabLogin.addEventListener('click', function () { switchTab('login'); });
      el.tabRegister.addEventListener('click', function () { switchTab('register'); });

      /* Toggle passwords */
      el.toggleLoginPwd.addEventListener('click', function () {
        togglePasswordVisibility(el.loginPwd, el.toggleLoginPwd);
      });
      el.toggleRegPwd.addEventListener('click', function () {
        togglePasswordVisibility(el.regPwd, el.toggleRegPwd);
      });

      /* Login */
      el.btnLogin.addEventListener('click', handleLogin);
      el.loginEmail.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') el.loginPwd.focus();
      });
      el.loginPwd.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleLogin();
      });

      /* Forgot password */
      el.btnForgot.addEventListener('click', function () {
        el.forgotOverlay.style.display = 'flex';
        el.forgotEmail.value = el.loginEmail.value;
      });
      el.btnForgotSend.addEventListener('click', handleForgot);
      el.btnForgotCancel.addEventListener('click', function () {
        el.forgotOverlay.style.display = 'none';
      });

      /* Anonymous */
      el.btnAnon.addEventListener('click', handleAnon);

      /* Register step 1 */
      el.btnRegStep1.addEventListener('click', handleRegStep1);
      el.regPseudo.addEventListener('input', function () {
        checkPseudo(this.value.trim());
      });

      /* Resend email */
      el.btnResendEmail.addEventListener('click', function () {
        if (state.resendCooldown) {
          SIS.toast.warning('Attends 60 secondes avant de renvoyer.');
          return;
        }
        if (!state.pendingUser) return;
        state.pendingUser.sendEmailVerification()
          .then(function () {
            SIS.toast.success('Email renvoyé !', 'Vérifie tes spams aussi.');
            state.resendCooldown = true;
            el.btnResendEmail.textContent = 'Renvoyer (60s)';
            el.btnResendEmail.disabled = true;
            setTimeout(function () {
              state.resendCooldown = false;
              el.btnResendEmail.textContent = 'Renvoyer l\'email';
              el.btnResendEmail.disabled = false;
            }, 60000);
          })
          .catch(function () {
            SIS.toast.error(SIS.i18n.t('error_network'));
          });
      });

      /* Email confirmed */
      el.btnEmailConfirmed.addEventListener('click', handleEmailConfirmed);

      /* Register step 3 */
      el.regPwd.addEventListener('input', function () {
        checkPwdStrength(this.value);
      });
      el.regPwd2.addEventListener('input', function () {
        var match = this.value === el.regPwd.value;
        el.pwd2Status.textContent = this.value.length > 0 ? (match ? '✓' : '✕') : '';
        el.pwd2Status.className = 'input-status ' + (match ? 'ok' : 'err');
      });
      el.btnRegStep3.addEventListener('click', handleRegStep3);

      /* CGU */
      el.cguCheckLabel.addEventListener('click', function () {
        state.cguAccepted = !state.cguAccepted;
        el.cguCheckBox.classList.toggle('checked', state.cguAccepted);
        el.btnCguAccept.disabled = !state.cguAccepted;
      });

      el.btnCguAccept.addEventListener('click', function () {
        if (!state.cguAccepted) return;
        hideCGU();
        if (typeof state._cguCallback === 'function') {
          var cb = state._cguCallback;
          state._cguCallback = null;
          cb();
        }
      });

      /* Fermer overlays sur clic backdrop */
      el.cguOverlay.addEventListener('click', function (e) {
        if (e.target === el.cguOverlay) hideCGU();
      });
      el.forgotOverlay.addEventListener('click', function (e) {
        if (e.target === el.forgotOverlay) el.forgotOverlay.style.display = 'none';
      });

      /* Profile setup */
      el.avatarUploadZone.addEventListener('click', function () {
        el.avatarInput.click();
      });
      el.avatarInput.addEventListener('change', function () {
        if (this.files && this.files[0]) handleAvatarChange(this.files[0]);
      });

      el.btnSkipSetup.addEventListener('click', function () {
        var uid = state.pendingUser ? state.pendingUser.uid : (SIS.user ? SIS.user.uid : null);
        showLinkReveal(uid);
      });
      el.btnGoFeed.addEventListener('click', handleGoFeed);

      /* Lang switcher */
      el.langOpts.forEach(function (opt) {
        opt.addEventListener('click', function () {
          var lang = opt.getAttribute('data-lang');
          SIS.i18n.setLang(lang);
          el.langOpts.forEach(function (o) { o.classList.remove('active'); });
          opt.classList.add('active');
        });
      });
    }

    /* ── INIT ── */
    function init() {
      cacheElements();
      bindEvents();
      checkExistingSession();
    }

    return { init: init };

  })();

  /* ══════════════════════════════════════════════════════════
     MODULE FEED
  ══════════════════════════════════════════════════════════ */
  var FeedModule = { init: function () {
    SIS.init({ page: 'feed', requireAuth: true, onReady: initFeed, onGuest: function () { window.location.href = 'auth.html'; } });
  }};

  function initFeed(user) {
    var fd = { myAnonLink: null };

    function q(id) { return document.getElementById(id); }

    /* ── LIEN ANONYME — cœur de l'Accueil ── */
    function loadAnonLink() {
      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        var pseudo = profile ? profile.pseudo : '';
        fd.myAnonLink = SIS.utils.anonLink(pseudo);
        var displayEl = q('anon-link-text');
        if (displayEl) displayEl.textContent = fd.myAnonLink.replace(/^https?:\/\//, '');
      }).catch(function(){});
    }

    function copyMyLink() {
      if (!fd.myAnonLink) return;
      SIS.utils.copyToClipboard(fd.myAnonLink);
      SIS.toast.success('Lien copié !');
    }

    function shareMyLink() {
      if (!fd.myAnonLink) return;
      if (navigator.share) {
        navigator.share({ title: 'SIS', text: 'Envoie-moi un message anonyme sur SIS 👀', url: fd.myAnonLink }).catch(function(){});
      } else {
        copyMyLink();
      }
    }

    /* Stories retiré du produit — loadStories/openStoryViewer/publishStory
       supprimés avec toute leur UI (strip, visionneuse, composer). */

    /* ── LIAISON DES ÉVÉNEMENTS ── */
    function bindEvents() {
      q('btn-anon-copy').addEventListener('click', copyMyLink);
      q('btn-anon-share').addEventListener('click', shareMyLink);
      q('anon-link-card').addEventListener('click', copyMyLink);
    }

    /* ── LANCER ── */
    bindEvents();
    loadAnonLink();
    SIS.injectBottomNav('feed');
  }

  /* ══════════════════════════════════════════════════════════
     MODULES PAGES STUBS (profil, notifs)
  ══════════════════════════════════════════════════════════ */
  var ProfilModule  = { init: function () { SIS.init({ page: 'profil',    requireAuth: true,  onReady: initProfil }); } };
  var NotifsModule  = { init: function () { SIS.init({ page: 'notifs',    requireAuth: true,  onReady: initNotifs }); } };
  /* ══════════════════════════════════════════════════════════
     MODULE PROFIL
  ══════════════════════════════════════════════════════════ */
  function initProfil(user) {
    /* FEATURE: profil.html n'affichait jamais que ton propre profil — clic
       sur un pseudo/notif/liste d'abonnés n'avait nulle part où t'emmener.
       ?uid=XXX permet désormais de visiter le profil de quelqu'un d'autre,
       posts et abonnés/suivis inclus (même convention que ?post= et ?dm=
       ailleurs dans l'app). Sans paramètre -> ton propre profil, comme avant. */
    var urlParams   = new URLSearchParams(window.location.search);
    var uidParam    = urlParams.get('uid');
    var viewedUid   = uidParam || user.uid;
    var isOwnProfil = viewedUid === user.uid;

    var pd = {
      profile:         null,
      viewedUid:       viewedUid,
      isOwnProfil:     isOwnProfil,
      pseudoCheckTimer:null,
      certifSharePublic: false,
      certifIdFile:    null,
      editAvatarFile:  null
    };

    function q(id) { return document.getElementById(id); }
    function qsa(sel,ctx) { return Array.from((ctx||document).querySelectorAll(sel)); }
    function showO(id) { var e=q(id); if(e) e.style.display='flex'; }
    function hideO(id) { var e=q(id); if(e) e.style.display='none'; }

    /* ── CHARGER PROFIL ── */
    function loadProfile() {
      SIS.authHelper.getProfile(pd.viewedUid).then(function(profile) {
        if (!profile) {
          if (pd.isOwnProfil) { window.location.href='auth.html'; }
          else { SIS.toast.error('Profil introuvable'); window.location.href='feed.html'; }
          return;
        }
        pd.profile = profile;
        renderProfile(profile);
      });
    }

    function renderProfile(p) {
      /* Couverture */
      /* FIX/FEATURE: jusqu'ici #profil-cover n'affichait jamais que le
         dégradé statique de la CSS — aucune photo n'était jamais rendue. */
      var coverEl = q('profil-cover');
      if (coverEl) {
        coverEl.style.backgroundImage = p.coverUrl
          ? 'url(' + SIS.cloudinary.url(p.coverUrl, 'cover') + ')'
          : '';
      }

      /* Avatar */
      var avWrap = q('profil-av-wrap');
      if (avWrap) {
        avWrap.innerHTML = SIS.renderAvatar({
          pseudo:    p.pseudo||'?',
          photoUrl:  p.photoUrl||null,
          certified: p.certified||false,
          size:      'xl',
          gradient:  SIS.utils.pseudoToGradient(p.pseudo||''),
          onClick:   null
        });
        SIS.bindAvatarClicks(avWrap);
      }

      /* Nom + badge */
      var nameEl = q('profil-name');
      if (nameEl) {
        nameEl.style.cssText = '';
        nameEl.className = 'profil-name';
        var certSvg = p.certified
          ? '<svg width="16" height="16" viewBox="0 0 24 24" style="flex-shrink:0"><defs><linearGradient id="pnGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5B8EF4"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#pnGrad)"/></svg>'
          : '';
        nameEl.innerHTML = SIS.utils.escHtml(p.pseudo||'?') + certSvg;
      }

      /* Bio */
      var bioEl = q('profil-bio');
      if (bioEl) bioEl.textContent = p.bio || '';

      /* Lien SIS */
      var link = SIS.utils.anonLink(p.pseudo||'');
      var linkEl = q('profil-sis-link');
      var linkTxt = q('profil-sis-link-text');
      if (linkEl) linkEl.style.display = 'flex';
      if (linkTxt) linkTxt.textContent = link;

      /* FEATURE : bascule mode visiteur / mode propriétaire. Le profil
         d'un tiers montre "Suivre"/"Message" au lieu de "Modifier"/
         "Certifier", et masque les réglages/déconnexion qui n'ont aucun
         sens sur le profil de quelqu'un d'autre. */
      if (!pd.isOwnProfil) {
        var topTitle = q('page-topbar-title');
        if (topTitle) topTitle.textContent = p.pseudo ? '@' + p.pseudo : 'Profil';
        document.title = (p.pseudo ? '@' + p.pseudo : 'Profil') + ' · SIS';
      }
      var ownActions   = q('profil-own-actions');
      var visitorActions = q('profil-visitor-actions');
      var settingsBtn  = q('btn-settings');
      var logoutBtn    = q('btn-logout');
      if (pd.isOwnProfil) {
        if (ownActions) ownActions.style.display = 'flex';
        if (visitorActions) visitorActions.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = '';
        if (logoutBtn) logoutBtn.style.display = '';
      } else {
        if (ownActions) ownActions.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        /* Section messages anonymes : ta boîte perso n'a rien à faire sur
           le profil de quelqu'un d'autre (le visiteur a déjà son propre
           bouton "Message anonyme" dans visitorActions). */
        var anonSection = q('anon-msgs-list');
        if (anonSection) anonSection.style.display = 'none';
        if (visitorActions) {
          visitorActions.style.display = 'flex';
          var msgBtn = q('btn-message-visitor');
          if (msgBtn) msgBtn.href = SIS.utils.anonLink(p.pseudo || '');
        }
      }

      /* Bouton certif */
      var certBtn = q('btn-certify');
      if (certBtn && p.certified) {
        certBtn.textContent = '✓ Certifié';
        certBtn.style.opacity = '0.6';
        certBtn.style.cursor = 'default';
      }

      /* Thème */
      SIS.theme.apply(p.theme || 'dark');

      /* Plus de tabs à charger conditionnellement — une seule section
         (messages anonymes) reste pertinente maintenant que Lives et Posts
         sont retirés du produit */
      loadAnonMsgs();
    }

    /* ── MESSAGES ANONYMES REÇUS ── */
    function loadAnonMsgs() {
      /* Redirige vers voir.html */
      var list = q('anon-msgs-list');
      if (!list) return;
      list.innerHTML =
        '<div style="text-align:center;padding:20px">' +
          '<p style="font-size:13px;color:var(--text2);margin-bottom:12px">Tes messages anonymes sont sur</p>' +
          '<a href="https://the-sis.vercel.app/voir.html" ' +
             'style="display:inline-block;padding:10px 20px;background:var(--grad);color:#fff;border-radius:var(--r-sm);font-weight:700;font-size:13px;text-decoration:none">' +
            '🔒 Voir mes messages anonymes' +
          '</a>' +
        '</div>';
    }

    /* Liste abonnés/suivis retirée : follow/abonnés n'existe plus dans SIS. */

    /* ── MODIFIER PROFIL ── */
    function openEditProfil() {
      var p = pd.profile;
      if (!p) return;

      /* Avatar dans le sheet */
      var avWrap = q('edit-av-wrap');
      if (avWrap) {
        avWrap.innerHTML = SIS.renderAvatar({
          pseudo: p.pseudo||'?', photoUrl: p.photoUrl||null, certified: p.certified||false,
          size: 'md', gradient: SIS.utils.pseudoToGradient(p.pseudo||'')
        });
      }

      /* Couverture dans le sheet */
      var coverZone = q('edit-cover-zone');
      if (coverZone) {
        coverZone.style.backgroundImage = p.coverUrl
          ? 'url(' + SIS.cloudinary.url(p.coverUrl, 'cover') + ')'
          : '';
      }

      var pseudoEl = q('edit-pseudo');
      var bioEl = q('edit-bio');
      var langEl = q('edit-lang');

      if (pseudoEl) pseudoEl.value = p.pseudo||'';
      if (bioEl) {
        bioEl.value = p.bio||'';
        /* FIX: q('edit-bio-count') sans null-check causait une TypeError si l'élément
           était absent du DOM (ex: sheet pas encore rendue). */
        var bioCountEl = q('edit-bio-count');
        if (bioCountEl) bioCountEl.textContent = (p.bio||'').length;
      }
      if (langEl) langEl.value = p.lang||'fr';

      /* Thème : SIS est dark-only désormais, .theme-opt n'existe plus dans
         le HTML — qsa() itère juste sur une liste vide, sans erreur */
      qsa('.theme-opt').forEach(function(opt) {
        opt.classList.toggle('active', opt.getAttribute('data-theme') === (p.theme||'dark'));
      });

      showO('edit-profil-overlay');
    }

    function saveProfil() {
      var pseudo  = q('edit-pseudo').value.trim();
      var bio     = q('edit-bio').value.trim();
      var lang    = q('edit-lang').value;
      var themeEl = document.querySelector('.theme-opt.active');
      var theme   = themeEl ? themeEl.getAttribute('data-theme') : 'dark';

      if (!SIS.security.isValidPseudo(pseudo)) {
        SIS.toast.error('Pseudo invalide', '3–24 caractères alphanumériques');
        return;
      }

      /* Vérif pseudo si changé */
      var pseudoChanged = pseudo !== (pd.profile.pseudo||'');
      var checkPromise = pseudoChanged
        ? SIS.db.collection('users').where('pseudo','==',pseudo).limit(1).get()
            .then(function(snap) { if(!snap.empty) throw new Error('Pseudo déjà pris'); })
        : Promise.resolve();

      var doSave = function() {
        var updates = { pseudo: pseudo, bio: bio.substring(0,160), lang: lang, theme: theme };
        SIS.i18n.setLang(lang);
        SIS.theme.apply(theme);

        var prog = q('edit-upload-progress');
        var fill = q('edit-progress-fill');
        var lbl  = q('edit-progress-label');
        function setProgress(pct, label) {
          if (prog) prog.style.display = 'flex';
          if (fill) fill.style.width = pct + '%';
          if (lbl)  lbl.textContent = label || ('Upload… ' + pct + '%');
        }

        /* Upload avatar si une nouvelle photo a été choisie */
        var avatarPromise = pd.editAvatarFile
          ? SIS.image.processAndUpload(pd.editAvatarFile, { type: 'avatar' }, function(pct){ setProgress(pct); })
              .then(function(result) { updates.photoUrl = result.publicId; })
          : Promise.resolve();

        /* FIX/FEATURE: upload de la photo de couverture (n'existait pas du
           tout auparavant — seul un dégradé statique était affiché). */
        var coverPromise = pd.editCoverFile
          ? avatarPromise.then(function() {
              return SIS.image.processAndUpload(pd.editCoverFile, { type: 'cover' }, function(pct){ setProgress(pct, 'Upload couverture… ' + pct + '%'); })
                .then(function(result) { updates.coverUrl = result.publicId; });
            })
          : avatarPromise;

        var savePromise = coverPromise.then(function() {
          return SIS.authHelper.updateProfile(user.uid, updates);
        });

        savePromise.then(function() {
          hideO('edit-profil-overlay');
          pd.editAvatarFile = null;
          pd.editCoverFile  = null;
          if (prog) prog.style.display = 'none';
          SIS.toast.success('Profil mis à jour !');
          loadProfile();
        }).catch(function(err){
          if (prog) prog.style.display = 'none';
          /* FIX: message générique remplacé par la vraie cause (ex: erreur
             Cloudinary précise) pour pouvoir enfin diagnostiquer le problème
             au lieu de deviner. */
          console.error('Erreur sauvegarde profil:', err);
          SIS.toast.error('Erreur sauvegarde', (err && err.message) || '');
        });
      };

      checkPromise.then(doSave).catch(function(e){ SIS.toast.error(e.message||'Pseudo déjà pris'); });
    }

    /* ── CERTIFICATION ── */
    function submitCertif() {
      var prenom = q('certif-prenom').value.trim();
      var nom    = q('certif-nom').value.trim();
      var ville  = q('certif-ville').value.trim();
      var age    = q('certif-age').value.trim();
      var pays   = q('certif-pays').value.trim();
      var avis   = q('certif-avis').value.trim();

      if (!prenom||!nom||!ville||!age||!pays) {
        SIS.toast.error('Remplis tous les champs obligatoires');
        return;
      }
      if (!pd.certifIdFile) {
        SIS.toast.error('Ajoute une photo de ta pièce d\'identité');
        return;
      }
      if (parseInt(age,10) < 13) {
        SIS.toast.error('Âge minimum : 13 ans');
        return;
      }

      /* Upload la pièce d'identité */
      SIS.image.uploadRaw(pd.certifIdFile).then(function(result) {
        /* Enregistrer la demande dans Firestore */
        return SIS.db.collection('certif_requests').add({
          uid:         user.uid,
          pseudo:      pd.profile ? pd.profile.pseudo : '',
          prenom:      prenom,
          nom:         nom,
          ville:       ville,
          pays:        pays,
          age:         parseInt(age,10),
          avis:        avis,
          sharePublic: pd.certifSharePublic,
          idPhotoUrl:  result.publicId,
          status:      'pending',
          createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });
      }).then(function() {
        /* Notif dans l'app sur le profil de gbaguidiexauce */
        SIS.db.collection('users')
          .where('email','==','gbaguidiexauce@gmail.com').limit(1).get()
          .then(function(snap) {
            if (!snap.empty) {
              SIS.notifs.push(snap.docs[0].id, SIS.notifs.TYPES.SYSTEM, {
                msg: 'Nouvelle demande de certification de ' + (pd.profile?pd.profile.pseudo:''),
                type: 'certif_request'
              });
            }
          });

        hideO('certif-overlay');
        SIS.toast.success('Demande envoyée !', 'Traitement sous 24h');
      }).catch(function(err){
        console.error('[SIS] Soumission certification échouée:', err);
        SIS.toast.error('Erreur envoi', err.message || '');
      });
    }

    /* ── PANEL ADMIN — relocalisé depuis chat.html (supprimé avec le chat).
       Stats globales, revue des demandes de certification, annonce. ── */
    function openAdminPanel() {
      var content = q('admin-content');
      if (!content) return;

      content.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Chargement…</div>';
      Promise.all([
        SIS.db.collection('users').get(),
        SIS.db.collection('users').where('certified','==',true).get(),
        SIS.db.collection('reports').where('resolved','==',false).get(),
        SIS.db.collection('users').where('banned','==',true).get(),
        SIS.db.collection('certif_requests').where('status','==','pending').get()
      ]).then(function(results) {
        content.innerHTML =
          '<div class="admin-stat-grid">' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[0].size + '</div><div class="admin-stat-lbl">Utilisateurs</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[1].size + '</div><div class="admin-stat-lbl">Certifiés</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[2].size + '</div><div class="admin-stat-lbl">Signalements</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[3].size + '</div><div class="admin-stat-lbl">Bannis</div></div>' +
          '</div>';

        var certifRequests = results[4];
        content.innerHTML +=
          '<div style="margin-top:16px">' +
            '<label class="input-label">Demandes de certification (' + certifRequests.size + ')</label>' +
            '<div id="admin-certif-list" style="display:flex;flex-direction:column;gap:8px;margin-top:8px"></div>' +
          '</div>';

        var certifList = q('admin-certif-list');
        if (certifRequests.empty) {
          certifList.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:10px 0">Aucune demande en attente.</div>';
        } else {
          certifRequests.forEach(function(reqDoc) {
            var r = reqDoc.data();
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;background:var(--card2);border-radius:12px;padding:10px';
            row.innerHTML =
              '<img src="'+SIS.cloudinary.url(r.idPhotoUrl,'thumb')+'" alt="Pièce d\'identité" ' +
                'style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;cursor:pointer" ' +
                'onerror="console.error(\'Image admin certif échouée:\',this.src);this.style.opacity=0.3" ' +
                'onclick="window.open(this.src.replace(/thumb.*upload/,\'upload\'),\'_blank\')">' +
              '<div style="flex:1;min-width:0;font-size:12px;color:var(--text)">' +
                '<div style="font-weight:700">'+SIS.utils.escHtml(r.pseudo||'?')+' · '+SIS.utils.escHtml(r.prenom||'')+' '+SIS.utils.escHtml(r.nom||'')+'</div>' +
                '<div style="color:var(--muted)">'+SIS.utils.escHtml(r.ville||'')+', '+SIS.utils.escHtml(r.pays||'')+' · '+(r.age||'?')+' ans</div>' +
                (r.avis ? '<div style="color:var(--muted);font-style:italic;margin-top:2px">"'+SIS.utils.escHtml(SIS.utils.truncate(r.avis,80))+'"</div>' : '') +
              '</div>' +
              '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">' +
                '<button class="btn-primary btn-sm" data-action="approve" aria-label="Approuver"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>' +
                '<button class="btn-ghost btn-sm danger-btn" data-action="reject" aria-label="Rejeter"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
              '</div>';

            row.querySelector('[data-action="approve"]').addEventListener('click', function(){
              handleCertifDecision(reqDoc.id, r, true, row);
            });
            row.querySelector('[data-action="reject"]').addEventListener('click', function(){
              handleCertifDecision(reqDoc.id, r, false, row);
            });
            certifList.appendChild(row);
          });
        }

        /* Annonce globale — adapté : salons n'existe plus, on notifie
           chaque utilisateur directement au lieu d'écrire dans des salons. */
        content.innerHTML +=
          '<div style="margin-top:16px">' +
            '<label class="input-label">Annonce globale</label>' +
            '<textarea id="admin-annonce" class="input" rows="3" placeholder="Message pour tous les utilisateurs…"></textarea>' +
            '<button class="btn-primary" style="margin-top:8px" id="btn-send-annonce">Envoyer l\'annonce</button>' +
          '</div>';

        var btn = q('btn-send-annonce');
        if (btn) {
          btn.addEventListener('click', function() {
            var msg = q('admin-annonce').value.trim();
            if (!msg) return;
            if (!window.confirm('Envoyer cette annonce à tous les utilisateurs ?')) return;
            btn.disabled = true; btn.textContent = 'Envoi…';
            SIS.db.collection('users').get().then(function(snap) {
              var docs = snap.docs;
              var batchSize = 400; /* limite Firestore : 500 écritures/batch, marge de sécurité */
              var chains = [];
              for (var i = 0; i < docs.length; i += batchSize) {
                (function(slice) {
                  var batch = SIS.db.batch();
                  slice.forEach(function(doc) {
                    var ref = SIS.db.collection('notifications').doc(doc.id).collection('items').doc();
                    batch.set(ref, {
                      type: SIS.notifs.TYPES.SYSTEM, msg: '📢 ' + msg,
                      read: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                  });
                  chains.push(batch.commit());
                })(docs.slice(i, i + batchSize));
              }
              return Promise.all(chains);
            }).then(function(){
              btn.disabled = false; btn.textContent = 'Envoyer l\'annonce';
              q('admin-annonce').value = '';
              SIS.toast.success('Annonce envoyée à tous les utilisateurs !');
            }).catch(function(err){
              btn.disabled = false; btn.textContent = 'Envoyer l\'annonce';
              SIS.toast.error(err.message || 'Envoi impossible');
            });
          });
        }
      }).catch(function(err) {
        console.error('[SIS] Admin panel load échoué:', err);
        content.innerHTML = '<div style="text-align:center;padding:30px;color:var(--red);font-size:13px">Erreur de chargement : ' + SIS.utils.escHtml(err.message||'inconnue') + '<br><span style="color:var(--muted)">Vérifie les règles Firestore pour ce compte admin.</span></div>';
      });

      showO('admin-panel-overlay');
    }

    function handleCertifDecision(reqId, reqData, approve, rowEl) {
      rowEl.style.opacity = '0.5';
      rowEl.style.pointerEvents = 'none';

      var updates = SIS.db.collection('certif_requests').doc(reqId)
        .update({ status: approve ? 'approved' : 'rejected', reviewedAt: firebase.firestore.FieldValue.serverTimestamp() });

      if (approve) {
        updates = updates.then(function(){
          return SIS.db.collection('users').doc(reqData.uid).update({ certified: true });
        });
      }

      updates.then(function(){
        SIS.notifs.push(reqData.uid, SIS.notifs.TYPES.SYSTEM, {
          msg: approve
            ? '✅ Ta demande de certification a été approuvée !'
            : 'Ta demande de certification n\'a pas été retenue. Tu peux la soumettre à nouveau avec plus de détails.',
          type: 'certif_result'
        });
        rowEl.remove();
        SIS.toast.success(approve ? 'Certifié ✓' : 'Demande rejetée');
      }).catch(function(err){
        rowEl.style.opacity = '';
        rowEl.style.pointerEvents = '';
        SIS.toast.error(err.message || 'Action impossible');
      });
    }

    /* ── SUPPRIMER COMPTE ── */
    function deleteAccount() {
      if (!confirm('Cette action est irréversible. Confirmes-tu la suppression de ton compte ?')) return;
      SIS.db.collection('users').doc(user.uid).delete()
        .then(function() { return user.delete(); })
        .then(function() { window.location.href='auth.html'; })
        .catch(function(){ SIS.toast.error('Reconnecte-toi puis réessaie.'); });
    }

    /* ── BIND ── */
    function bindEvents() {
      /* Panel admin visible uniquement pour le compte admin */
      if (user && user.email === 'gbaguidiexauce@gmail.com') {
        var adminSection = q('settings-admin-section');
        if (adminSection) adminSection.style.display = 'block';
      }
      q('btn-open-admin') && q('btn-open-admin').addEventListener('click', openAdminPanel);
      q('admin-close') && q('admin-close').addEventListener('click', function(){ hideO('admin-panel-overlay'); });

      /* Tabs retirés : une seule section (messages anonymes) reste
         pertinente maintenant que Lives et Posts sont partis */

      /* Edit profil */
      q('btn-edit-profil') && q('btn-edit-profil').addEventListener('click', openEditProfil);
      q('edit-profil-overlay') && q('edit-profil-overlay').addEventListener('click', function(e){ if(e.target===this) hideO('edit-profil-overlay'); });
      q('btn-save-profil') && q('btn-save-profil').addEventListener('click', saveProfil);

      /* Avatar edit */
      q('btn-change-avatar') && q('btn-change-avatar').addEventListener('click', function(){ q('edit-avatar-input').click(); });
      q('edit-avatar-input') && q('edit-avatar-input').addEventListener('change', function() {
        var file = this.files && this.files[0];
        if (!file) return;
        pd.editAvatarFile = file;
        var avW = q('edit-av-wrap');
        if (avW) {
          var reader = new FileReader();
          reader.onload = function(e) {
            var img = avW.querySelector('.av');
            if (img) { img.style.backgroundImage='url('+e.target.result+')'; img.style.backgroundSize='cover'; img.textContent=''; }
          };
          reader.readAsDataURL(file);
        }
        SIS.toast.info('Photo sélectionnée · sera uploadée à la sauvegarde');
      });

      /* Cover photo edit */
      q('btn-change-cover') && q('btn-change-cover').addEventListener('click', function(){ q('edit-cover-input').click(); });
      q('edit-cover-input') && q('edit-cover-input').addEventListener('change', function() {
        var file = this.files && this.files[0];
        if (!file) return;
        pd.editCoverFile = file;
        var coverZone = q('edit-cover-zone');
        if (coverZone) {
          var reader = new FileReader();
          reader.onload = function(e) {
            coverZone.style.backgroundImage = 'url(' + e.target.result + ')';
          };
          reader.readAsDataURL(file);
        }
        SIS.toast.info('Couverture sélectionnée · sera uploadée à la sauvegarde');
      });

      /* Pseudo check */
      q('edit-pseudo') && q('edit-pseudo').addEventListener('input', function() {
        clearTimeout(pd.pseudoCheckTimer);
        var pseudo = this.value.trim();
        var status = q('edit-pseudo-status');
        if (!status) return;
        if (pseudo === (pd.profile&&pd.profile.pseudo)) { status.textContent=''; return; }
        if (!SIS.security.isValidPseudo(pseudo)) { status.textContent='✕'; status.className='input-status err'; return; }
        pd.pseudoCheckTimer = setTimeout(function() {
          SIS.db.collection('users').where('pseudo','==',pseudo).limit(1).get()
            .then(function(snap) {
              status.textContent = snap.empty ? '✓' : '✕';
              status.className = 'input-status ' + (snap.empty?'ok':'err');
            });
        }, 600);
      });

      /* Bio count */
      q('edit-bio') && q('edit-bio').addEventListener('input', function() {
        var c = q('edit-bio-count'); if(c) c.textContent = this.value.length;
      });

      /* Thème dans edit */
      qsa('.theme-opt').forEach(function(opt) {
        opt.addEventListener('click', function() {
          qsa('.theme-opt').forEach(function(o){ o.classList.remove('active'); });
          opt.classList.add('active');
        });
      });

      /* Certif */
      q('btn-certify') && q('btn-certify').addEventListener('click', function() {
        if (pd.profile && pd.profile.certified) return;
        showO('certif-overlay');
      });
      q('certif-overlay') && q('certif-overlay').addEventListener('click', function(e){ if(e.target===this) hideO('certif-overlay'); });
      q('certif-id-zone') && q('certif-id-zone').addEventListener('click', function(){ q('certif-id-input').click(); });
      q('certif-id-input') && q('certif-id-input').addEventListener('change', function() {
        var file = this.files && this.files[0];
        if (!file) return;
        pd.certifIdFile = file;
        var lbl = q('certif-id-label');
        if (lbl) lbl.textContent = '✓ ' + file.name;
        SIS.toast.success('Photo sélectionnée');
      });
      q('certif-share-box') && q('certif-share-box').addEventListener('click', function() {
        pd.certifSharePublic = !pd.certifSharePublic;
        this.classList.toggle('checked', pd.certifSharePublic);
      });
      q('btn-send-certif') && q('btn-send-certif').addEventListener('click', submitCertif);

      /* Lien SIS */
      q('btn-copy-sis-link') && q('btn-copy-sis-link').addEventListener('click', function() {
        if (!pd.profile) return;
        SIS.utils.copyToClipboard(SIS.utils.anonLink(pd.profile.pseudo||''))
          .then(function(){ SIS.toast.success(SIS.i18n.t('copy_success')); });
      });
      q('btn-share-sis-link') && q('btn-share-sis-link').addEventListener('click', function() {
        if (!pd.profile) return;
        SIS.utils.share({ title:'Mon lien SIS', url: SIS.utils.anonLink(pd.profile.pseudo||'') });
      });

      /* Paramètres */
      q('btn-settings') && q('btn-settings').addEventListener('click', function(){ showO('settings-overlay'); });
      q('settings-overlay') && q('settings-overlay').addEventListener('click', function(e){ if(e.target===this) hideO('settings-overlay'); });
      q('toggle-theme') && q('toggle-theme').addEventListener('click', function() {
        SIS.theme.toggle();
        this.classList.toggle('on', SIS.theme.get()==='dark');
      });
      if (q('toggle-theme')) q('toggle-theme').classList.toggle('on', SIS.theme.get()==='dark');

      /* Déconnexion */
      q('btn-logout') && q('btn-logout').addEventListener('click', function() {
        SIS.authHelper.logout().then(function(){ window.location.href='auth.html'; });
      });

      /* Supprimer compte */
      q('btn-delete-account') && q('btn-delete-account').addEventListener('click', deleteAccount);
    }

    bindEvents();
    loadProfile();
    SIS.injectBottomNav('profil');
  }

  /* ══════════════════════════════════════════════════════════
     MODULE NOTIFS
  ══════════════════════════════════════════════════════════ */
  function initNotifs(user) {
    var nd = { currentFilter: '' };
    function q(id) { return document.getElementById(id); }
    function qsa(sel,ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }

    var NOTIF_META = {
      like:    { icon:'❤️',  cls:'nicon-like',    label:'a réagi à ton post' },
      follow:  { icon:'👤',  cls:'nicon-follow',  label:'te suit maintenant' },
      comment: { icon:'💬',  cls:'nicon-comment', label:'a commenté ton post' },
      anon:    { icon:'🔒',  cls:'nicon-anon',    label:'t\'a envoyé un message anonyme' },
      mention: { icon:'@',   cls:'nicon-mention', label:'t\'a mentionné' },
      echo:    { icon:'🔄',  cls:'nicon-echo',    label:'a Echo ton post' },
      battle:  { icon:'⚡',  cls:'nicon-battle',  label:'a voté sur ton Battle' },
      burn:    { icon:'🔥',  cls:'nicon-burn',    label:'— Burn : limite de vues atteinte' },
      system:  { icon:'ℹ️', cls:'nicon-system',  label:'' }
    };

    function loadNotifs() {
      var list = q('notifs-list');
      if (!list) return;

      /* FIX BUG CONFIRMÉ: chaque appel à loadNotifs() (ex: clic sur un
         filtre) créait un NOUVEL onSnapshot sans jamais désabonner le
         précédent -> plusieurs listeners tournaient en parallèle,
         reconstruisant la liste indépendamment les uns des autres
         (clignotement, doublons, comportement imprévisible au fil du
         temps). */
      if (nd.unsubNotifs) { nd.unsubNotifs(); nd.unsubNotifs = null; }

      var query = SIS.db.collection('notifications').doc(user.uid)
        .collection('items').orderBy('createdAt','desc').limit(50);

      nd.unsubNotifs = query.onSnapshot(function(snap) {
        list.innerHTML = '';
        var empty = q('notifs-empty');

        if (snap.empty) {
          if (empty) empty.style.display = 'block';
          return;
        }
        if (empty) empty.style.display = 'none';

        snap.forEach(function(doc) {
          var d = doc.data();
          if (nd.currentFilter && d.type !== nd.currentFilter) return;
          var meta = NOTIF_META[d.type] || NOTIF_META.system;

          var item = document.createElement('div');
          item.className = 'notif-item' + (!d.read ? ' unread' : '');
          item.setAttribute('data-id', doc.id);

          var fromAvatar = '';
          if (d.fromPseudo) {
            fromAvatar = SIS.renderAvatar({
              pseudo: d.fromPseudo, size:'sm', photoUrl: d.fromPhotoUrl || null,
              gradient: SIS.utils.pseudoToGradient(d.fromPseudo)
            });
          } else {
            fromAvatar = '<div class="notif-icon-wrap '+meta.cls+'"><span style="font-size:16px">'+meta.icon+'</span></div>';
          }

          var msgText = d.fromPseudo
            ? '<strong>'+SIS.utils.escHtml(d.fromPseudo)+'</strong> '+meta.label
            : meta.label || (d.msg || '');

          if (d.type==='burn') msgText = 'Ton post <strong>Burn</strong> a atteint la limite — il s\'est autodétruit';
          if (d.emoji) msgText += ' ' + d.emoji;

          item.innerHTML =
            fromAvatar +
            '<div class="notif-body">' +
              '<div class="notif-text">' + msgText + '</div>' +
              '<div class="notif-time">' + SIS.utils.timeAgo(d.createdAt) + '</div>' +
            '</div>' +
            (!d.read ? '<div class="notif-unread-dot"></div>' : '');

          item.addEventListener('click', function() {
            /* Marquer comme lu */
            SIS.db.collection('notifications').doc(user.uid).collection('items')
              .doc(doc.id).update({ read:true }).catch(function(){});

            /* FIX: seuls 2-3 types sur 9 avaient une vraie navigation.
               Chaque type gère maintenant son action au clic. */
            if (d.liveId) {
              window.location.href = 'feed.html?live=' + d.liveId;
            } else if (d.postId) {
              window.location.href = 'feed.html?post='+d.postId;
            } else if (d.type === 'follow') {
              if (d.fromUid) window.location.href = 'profil.html?uid=' + d.fromUid;
              else if (d.fromPseudo) SIS.profilePopup.show(d.fromPseudo);
            } else if (d.type === 'anon') {
              window.location.href = 'https://the-sis.vercel.app/voir.html';
            } else if (d.type === 'system') {
              if (d.link) window.location.href = d.link;
              else window.location.href = 'profil.html';
            }
            /* burn / mention sans postId : rien à ouvrir, le marquage lu suffit. */
          });

          SIS.bindAvatarClicks(item);
          list.appendChild(item);
        });
      }, function(e){ console.warn('Notifs err',e); });
    }

    /* Marquer tout comme lu */
    function markAllRead() {
      SIS.notifs.markAllRead(user.uid).then(function(){
        SIS.toast.success('Tout marqué comme lu');
      }).catch(function(){});
    }

    function bindEvents() {
      /* Filtres */
      qsa('.nfilter').forEach(function(f) {
        f.addEventListener('click', function() {
          qsa('.nfilter').forEach(function(x){ x.classList.remove('active'); });
          f.classList.add('active');
          nd.currentFilter = f.getAttribute('data-type');
          loadNotifs();
        });
      });

      q('btn-mark-all-read') && q('btn-mark-all-read').addEventListener('click', markAllRead);
    }

    bindEvents();
    loadNotifs();
    SIS.injectBottomNav('notifs');
  }



  /* ── APPEL BOOTSTRAP — après TOUTES les déclarations ── */
  /* Var hoisting : tous les modules sont définis ici */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap(); /* DOM déjà prêt */
  }

})();
