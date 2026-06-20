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
        case 'chat':      ChatModule.init();      break;
        case 'profil':    ProfilModule.init();    break;
        case 'notifs':    NotifsModule.init();    break;
        case 'decouvrir': DiscoverModule.init();  break;
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
      currentSlide:    0,
      totalSlides:     5,
      currentScreen:   'slides',   /* slides | auth | interests | profile-setup */
      authMode:        'login',    /* login | register */
      regStep:         1,          /* 1 | 2 | 3 */
      regEmail:        '',
      regPseudo:       '',
      selectedInterests: [],
      cguAccepted:     false,
      avatarPublicId:  null,
      pendingUser:     null,       /* user Firebase en attente de complétion */
      pseudoCheckTimer: null,
      resendCooldown:  false
    };

    /* ── Éléments DOM ── */
    var el = {};

    function cacheElements() {
      /* Screens */
      el.screenSlides  = document.getElementById('screen-slides');
      el.screenAuth    = document.getElementById('screen-auth');
      el.screenInterests = document.getElementById('screen-interests');
      el.screenSetup   = document.getElementById('screen-profile-setup');

      /* Slides */
      el.slidesWrapper = document.getElementById('slides-wrapper');
      el.dots          = document.querySelectorAll('.dot');
      el.btnNext       = document.getElementById('btn-next');
      el.btnSkip       = document.getElementById('btn-skip');

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

      /* Back buttons */
      el.btnBackSlides = document.getElementById('btn-back-to-slides');
      el.btnBackInterests = document.getElementById('btn-back-interests');

      /* Interests */
      el.interestChips = document.querySelectorAll('.interest-chip');
      el.interestsCount= document.getElementById('interests-count');
      el.btnInterestsDone = document.getElementById('btn-interests-done');

      /* Profile setup */
      el.avatarUploadZone = document.getElementById('avatar-upload-zone');
      el.avatarInput   = document.getElementById('avatar-input');
      el.avatarPreview = document.getElementById('avatar-preview');
      el.avatarImg     = document.getElementById('avatar-img');
      el.avatarInitials= document.getElementById('avatar-initials');
      el.setupBio      = document.getElementById('setup-bio');
      el.bioCount      = document.getElementById('bio-count');
      el.uploadProgress= document.getElementById('upload-progress');
      el.uploadProgressFill = document.getElementById('upload-progress-fill');
      el.uploadProgressLabel = document.getElementById('upload-progress-label');
      el.btnSkipSetup  = document.getElementById('btn-skip-setup');
      el.btnGoFeed     = document.getElementById('btn-go-feed');

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

    /* ── Navigation entre slides ── */
    function goToSlide(index) {
      if (index < 0 || index >= state.totalSlides) return;
      state.currentSlide = index;
      el.slidesWrapper.style.transform = 'translateX(-' + (index * 20) + '%)';

      /* Dots */
      el.dots.forEach(function (d, i) {
        d.classList.toggle('active', i === index);
      });

      /* Bouton next → "Commencer" sur le dernier slide */
      if (index === state.totalSlides - 1) {
        el.btnNext.textContent = 'Commencer 🚀';
        el.btnSkip.style.visibility = 'hidden';
      } else {
        el.btnNext.textContent = 'Suivant →';
        el.btnSkip.style.visibility = 'visible';
      }
    }

    /* ── Navigation entre screens ── */
    function showScreen(name) {
      var screens = {
        slides:         el.screenSlides,
        auth:           el.screenAuth,
        interests:      el.screenInterests,
        'profile-setup':el.screenSetup
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
          /* Vérif si profil complet (interests) */
          return SIS.db.collection('users').doc(cred.user.uid).get()
            .then(function (doc) {
              setLoading(false);
              if (!doc.exists || !doc.data().interests || doc.data().interests.length === 0) {
                state.pendingUser = cred.user;
                showScreen('interests');
              } else {
                window.location.href = 'feed.html';
              }
            });
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
          SIS.toast.success('Compte créé !', 'Bienvenue sur SIS 🎉');
          showScreen('interests');
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
        showScreen('interests');
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

    /* ── CENTRES D'INTÉRÊT ── */
    function handleInterestToggle(chip) {
      chip.classList.toggle('selected');
      state.selectedInterests = Array.from(
        document.querySelectorAll('.interest-chip.selected')
      ).map(function (c) { return c.getAttribute('data-tag'); });

      el.interestsCount.textContent = state.selectedInterests.length;
      el.btnInterestsDone.disabled = state.selectedInterests.length < 3;
    }

    function handleInterestsDone() {
      if (state.selectedInterests.length < 3) return;

      var uid = state.pendingUser
        ? state.pendingUser.uid
        : (SIS.user ? SIS.user.uid : null);

      if (!uid) {
        showScreen('profile-setup');
        return;
      }

      setLoading(true);
      SIS.db.collection('users').doc(uid)
        .update({ interests: state.selectedInterests })
        .then(function () {
          setLoading(false);
          showScreen('profile-setup');
        })
        .catch(function () {
          setLoading(false);
          showScreen('profile-setup');
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
        window.location.href = 'feed.html';
        return;
      }

      var updates = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      var bio = el.setupBio.value.trim();
      if (bio)                  updates.bio = bio.substring(0, 160);
      if (state.avatarPublicId) updates.photoUrl = state.avatarPublicId;

      setLoading(true);
      SIS.db.collection('users').doc(uid).update(updates)
        .then(function () {
          setLoading(false);
          window.location.href = 'feed.html';
        })
        .catch(function () {
          setLoading(false);
          window.location.href = 'feed.html';
        });
    }

    /* ── TOGGLE VISIBILITÉ MOT DE PASSE ── */
    function togglePasswordVisibility(inputEl, btnEl) {
      var isHidden = inputEl.type === 'password';
      inputEl.type = isHidden ? 'text' : 'password';
      btnEl.querySelector('svg').style.opacity = isHidden ? '1' : '0.5';
    }

    /* ── SWIPE sur les slides (Android natif) ── */
    function bindSlideSwipe() {
      var startX = 0;
      var wrapper = el.slidesWrapper;

      wrapper.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
      }, { passive: true });

      wrapper.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) {
          if (dx < 0 && state.currentSlide < state.totalSlides - 1) {
            goToSlide(state.currentSlide + 1);
          } else if (dx > 0 && state.currentSlide > 0) {
            goToSlide(state.currentSlide - 1);
          }
        }
      }, { passive: true });
    }

    /* ── VÉRIFIER SI DÉJÀ CONNECTÉ ── */
    function checkExistingSession() {
      SIS.auth.onAuthStateChanged(function (user) {
        if (!user) return;

        /* User connecté → vérifier si profil complet */
        SIS.db.collection('users').doc(user.uid).get()
          .then(function (doc) {
            if (!doc.exists) {
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

            /* Profil incomplet → compléter */
            if (!data.interests || data.interests.length === 0) {
              state.pendingUser = user;
              showScreen('interests');
              return;
            }

            /* Tout bon → feed */
            window.location.href = 'feed.html';
          })
          .catch(function () {});
      });
    }

    /* ── BIND EVENTS ── */
    function bindEvents() {
      /* Slides navigation */
      el.btnNext.addEventListener('click', function () {
        if (state.currentSlide < state.totalSlides - 1) {
          goToSlide(state.currentSlide + 1);
        } else {
          showScreen('auth');
        }
      });

      el.btnSkip.addEventListener('click', function () {
        showScreen('auth');
      });

      /* Dots */
      el.dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          goToSlide(parseInt(dot.getAttribute('data-i'), 10));
        });
      });

      /* Swipe */
      bindSlideSwipe();

      /* Back buttons */
      el.btnBackSlides.addEventListener('click', function () {
        showScreen('slides');
      });

      el.btnBackInterests.addEventListener('click', function () {
        showScreen('interests');
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

      /* Intérêts */
      el.interestChips.forEach(function (chip) {
        chip.addEventListener('click', function () { handleInterestToggle(chip); });
      });
      el.btnInterestsDone.addEventListener('click', handleInterestsDone);

      /* Profile setup */
      el.avatarUploadZone.addEventListener('click', function () {
        el.avatarInput.click();
      });
      el.avatarInput.addEventListener('change', function () {
        if (this.files && this.files[0]) handleAvatarChange(this.files[0]);
      });

      /* Bio counter */
      el.setupBio.addEventListener('input', function () {
        el.bioCount.textContent = this.value.length;
      });

      el.btnSkipSetup.addEventListener('click', function () {
        window.location.href = 'feed.html';
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
      goToSlide(0);
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
    var fd = {
      currentTab:    'global',
      currentMood:   '',
      lastDoc:       null,
      loading:       false,
      noMore:        false,
      unsubPosts:    null,
      unsubStories:  null,
      postType:      'confession',
      identity:      'anon',
      battleDur:     86400,
      burnViews:     50,
      burnTimer:     3600,
      storyBg:       'linear-gradient(135deg,#5B8EF4,#8B5CF6)',
      mediaFile:     null,
      mediaGifUrl:   null,
      mediaMode:     'image',
      echoPostId:    null,
      commentPostId: null,
      roulettePosts: [],
      rouletteIdx:   0,
      pacteCallback: null,
      pacteSkipTimer:null,
      threadBlocks:  1,
      TENOR_KEY:     '', /* → Mets ta clé Tenor ici : console.cloud.google.com/apis/tenor */
      PAGE_SIZE:     10
    };

    /* ── HELPERS ── */
    function q(id) { return document.getElementById(id); }
    function qs(sel, ctx) { return (ctx||document).querySelector(sel); }
    function qsa(sel, ctx) { return Array.from((ctx||document).querySelectorAll(sel)); }

    function showOverlay(id)  { var e=q(id); if(e) e.style.display='flex'; }
    function hideOverlay(id)  { var e=q(id); if(e) e.style.display='none'; }

    /* ── RENDER POST ── */
    function renderPost(doc) {
      var d   = doc.data();
      var id  = doc.id;
      var div = document.createElement('div');
      var extra = d.type === 'whisper' ? ' whisper' : (d.type === 'burn' ? ' burn' : '');
      div.className = 'post-card' + extra;
      div.setAttribute('data-id', id);

      var certified = d.authorCertified || false;
      var pseudoDisplay = d.identity === 'anon'
        ? 'Anonyme'
        : d.identity === 'mystery'
          ? '🎭 Mystère'
          : SIS.utils.escHtml(d.authorPseudo || 'User');

      var avatarHtml = SIS.renderAvatar({
        photoUrl:  d.identity === 'name' ? (d.authorPhoto || null) : null,
        pseudo:    d.identity === 'name' ? (d.authorPseudo || '?') : (d.identity === 'mystery' ? '🎭' : '?'),
        certified: d.identity === 'name' && certified,
        size:      'sm',
        gradient:  d.identity === 'anon'
          ? 'linear-gradient(135deg,#f04f5a,#8B5CF6)'
          : SIS.utils.pseudoToGradient(d.authorPseudo || id),
        onClick:   d.identity === 'name' ? function(pseudo) { SIS.profilePopup.show(pseudo); } : null
      });

      var certBadge = d.identity === 'name' && certified
        ? '<svg width="13" height="13" viewBox="0 0 24 24" style="flex-shrink:0"><defs><linearGradient id="pcg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5B8EF4"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#pcg)"/></svg>'
        : '';

      /* Type badge */
      var typeCls = {
        confession:'type-confession',csdpm:'type-csdpm',whisper:'type-whisper',
        battle:'type-battle',burn:'type-burn',media:'type-media',
        poll:'type-poll',thread:'type-thread'
      };
      var typeLabel = {
        confession:'Confession',csdpm:'CSDPM',whisper:'Whisper',
        battle:'Battle ⚡',burn:'🔥 Burn',media:'Media',poll:'Poll',thread:'Thread 🧵'
      };

      var header =
        '<div class="post-header">' +
          avatarHtml +
          '<div class="post-identity-info">' +
            '<div class="post-pseudo">' + pseudoDisplay + certBadge + '</div>' +
            '<div class="post-meta">' +
              (d.authorCountry ? d.authorCountry + ' · ' : '') +
              SIS.utils.timeAgo(d.createdAt) +
            '</div>' +
          '</div>' +
          '<span class="post-type ' + (typeCls[d.type] || 'type-confession') + '">' +
            (typeLabel[d.type] || d.type) +
          '</span>' +
          '<button class="post-more-btn" data-id="' + id + '">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>' +
          '</button>' +
        '</div>';

      var body = '';

      /* Corps selon type */
      if (d.type === 'confession' || d.type === 'csdpm' || d.type === 'whisper') {
        body = '<div class="post-body">' + SIS.utils.parseText(d.text || '') + '</div>';

      } else if (d.type === 'burn') {
        body =
          '<div class="burn-meta-row">' +
            '<div class="burn-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
              burnTimeLeft(d.burnExpiresAt) +
            '</div>' +
            '<div class="burn-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
              (d.viewCount || 0) + '/' + (d.burnMaxViews || 100) + ' vues' +
            '</div>' +
          '</div>' +
          '<div class="post-body">' + SIS.utils.parseText(d.text || '') + '</div>';

      } else if (d.type === 'battle') {
        var totalVotes = (d.options || []).reduce(function(s,o){ return s + (o.votes||0); }, 0);
        var optsHtml = (d.options || []).map(function(opt, i) {
          var pct = totalVotes > 0 ? Math.round((opt.votes||0)/totalVotes*100) : 0;
          var isLead = (opt.votes||0) === Math.max.apply(null,(d.options||[]).map(function(o){return o.votes||0;}));
          return '<div class="battle-opt' + (isLead?' leading':'') + '" data-idx="' + i + '" data-post="' + id + '">' +
            '<div class="battle-bar-fill" style="width:' + pct + '%"></div>' +
            '<div class="battle-opt-row"><span style="position:relative">' + SIS.utils.escHtml(opt.text||'') + '</span>' +
            '<span class="battle-pct">' + pct + '%</span></div>' +
            '</div>';
        }).join('');
        body =
          '<div class="post-body">' + SIS.utils.parseText(d.question||d.text||'') + '</div>' +
          '<div class="battle-opts">' + optsHtml + '</div>' +
          '<div class="battle-footer">' + SIS.utils.formatCount(totalVotes) + ' votes</div>';

      } else if (d.type === 'poll') {
        var totalPollVotes = (d.options || []).reduce(function(s,o){ return s+(o.votes||0); }, 0);
        var pollHtml = (d.options || []).map(function(opt, i) {
          var pct = totalPollVotes > 0 ? Math.round((opt.votes||0)/totalPollVotes*100) : 0;
          return '<div class="poll-opt" data-idx="' + i + '" data-post="' + id + '">' +
            '<div class="poll-bar-fill" style="width:' + pct + '%"></div>' +
            '<div class="poll-opt-row"><span style="position:relative">' + SIS.utils.escHtml(opt.text||'') + '</span>' +
            '<span class="poll-pct">' + pct + '%</span></div>' +
            '</div>';
        }).join('');
        body =
          '<div class="post-body">' + SIS.utils.parseText(d.question||d.text||'') + '</div>' +
          '<div class="poll-opts">' + pollHtml + '</div>';

      } else if (d.type === 'media') {
        var caption = d.caption ? '<div class="post-body">' + SIS.utils.parseText(d.caption) + '</div>' : '';
        var mediaEl = d.gifUrl
          ? '<img class="post-media-gif" src="' + SIS.utils.escHtml(d.gifUrl) + '" loading="lazy" alt="GIF">'
          : d.mediaUrl
            ? '<img class="post-media-img" src="' + SIS.cloudinary.url(d.mediaUrl,'feed') + '" loading="lazy" alt="Media">'
            : '';
        body = caption + mediaEl;

      } else if (d.type === 'thread') {
        var blocksHtml = (d.blocks || []).map(function(b, i) {
          return '<div class="thread-block"><div class="thread-block-num">' + (i+1) + '/' + d.blocks.length + '</div>' +
            SIS.utils.parseText(b) + '</div>';
        }).join('');
        body = '<div class="thread-blocks">' + blocksHtml + '</div>';
      }

      /* Echo preview */
      var echoHtml = '';
      if (d.echoOf) {
        echoHtml = '<div class="echo-original"><div class="echo-original-meta">↩ Echo de ' +
          SIS.utils.escHtml(d.echoOriginalPseudo || 'quelqu\'un') + '</div>' +
          SIS.utils.parseText(d.echoOriginalText || '') + '</div>';
      }

      /* Reactions */
      var reactEmojis = ['❤️','❤️‍🔥','😂','😮','😢','😡'];
      var reactsHtml = '<div class="reaction-bar">' +
        reactEmojis.map(function(e) {
          var cnt = (d.reactions && d.reactions[e]) || 0;
          if (cnt === 0 && !d.reactions) return '';
          return cnt > 0
            ? '<div class="reaction-pill" data-emoji="' + e + '" data-post="' + id + '">' + e + ' <span>' + SIS.utils.formatCount(cnt) + '</span></div>'
            : '';
        }).join('') +
        '</div>';

      /* Actions */
      var actions =
        '<div class="post-actions">' +
          '<div class="post-action" data-action="comment" data-id="' + id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            (d.commentsCount || 0) +
          '</div>' +
          '<div class="post-action" data-action="echo" data-id="' + id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
            (d.echoCount || 0) +
          '</div>' +
          '<div class="post-action" data-action="react" data-id="' + id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
          '</div>' +
          '<div class="post-action" data-action="share" data-id="' + id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
          '</div>' +
        '</div>';

      div.innerHTML = header + echoHtml + body + reactsHtml + actions;
      SIS.bindAvatarClicks(div);
      return div;
    }

    /* Temps restant Burn */
    function burnTimeLeft(ts) {
      if (!ts) return '?';
      var exp = ts.toDate ? ts.toDate() : new Date(ts);
      var diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      if (diff < 3600)  return Math.floor(diff/60) + 'min';
      if (diff < 86400) return Math.floor(diff/3600) + 'h';
      return Math.floor(diff/86400) + 'j';
    }

    /* ── CHARGER LES POSTS ── */
    function buildQuery() {
      var q = SIS.db.collection('posts')
        .where('hidden', '==', false);

      if (fd.currentTab === 'viral') {
        q = q.orderBy('echoCount', 'desc').orderBy('createdAt', 'desc');
      } else if (fd.currentTab === 'csdpm') {
        /* BUG-12: orderBy sur champ différent de where nécessite index composite → orderBy seul */
        q = q.where('type', '==', 'csdpm').orderBy('createdAt', 'desc');
      } else if (fd.currentTab === 'whispers') {
        q = q.where('type', '==', 'whisper').orderBy('createdAt', 'desc');
      } else if (fd.currentTab === 'battles') {
        q = q.where('type', '==', 'battle').orderBy('createdAt', 'desc');
      } else if (fd.currentTab === 'following') {
        /* Posts des users suivis — nécessite un index Firestore */
        /* BUG-06 fix: .in() avec tableau vide crash Firestore → fallback global */
        var followList = fd.followingList && fd.followingList.length > 0 ? fd.followingList : null;
        if (followList && followList.length > 0) {
          /* Firestore .in() max 30 éléments - on prend les 30 plus récents */
          var chunk = followList.slice(0, 30);
          q = q.where('authorUid', 'in', chunk).orderBy('createdAt', 'desc');
        } else {
          /* Pas encore d'abonnements → fallback feed global */
          q = SIS.db.collection('posts').where('hidden','==',false).orderBy('createdAt', 'desc');
        }
      } else {
        q = q.orderBy('createdAt', 'desc');
      }

      if (fd.currentMood) {
        q = q.where('mood', '==', fd.currentMood);
      }

      return q;
    }

    function loadPosts(reset) {
      if (fd.loading || (fd.noMore && !reset)) return;
      fd.loading = true;

      if (reset) {
        fd.lastDoc = null;
        fd.noMore  = false;
        q('posts-list').innerHTML = '';
        q('feed-skeletons').style.display = 'block';
      }

      var query = buildQuery().limit(fd.PAGE_SIZE);
      if (fd.lastDoc) query = query.startAfter(fd.lastDoc);

      query.get()
        .then(function (snap) {
          if (!q('feed-skeletons')) return; /* page déjà quittée */
          q('feed-skeletons').style.display = 'none';
          fd.loading = false;
          if (q('feed-loader')) q('feed-loader').style.display = 'none';

          if (snap.empty && reset) {
            /* FIX: var emptyEl était déclaré deux fois (copier-coller) */
            var emptyEl = q('feed-empty');
            if (emptyEl) {
              emptyEl.style.display = 'block';
              var emptyHtml = document.createElement('div');
              emptyHtml.innerHTML = '<div class="feed-empty-icon">&#10024;</div>';
              var et = document.createElement('div'); et.className='feed-empty-title'; et.textContent='Sois le premier a publier !'; emptyHtml.appendChild(et);
              var es = document.createElement('div'); es.className='feed-empty-sub'; es.textContent='SIS est tout neuf. Publie le premier post !'; emptyHtml.appendChild(es);
              var eb = document.createElement('button'); eb.className='btn-primary'; eb.style.cssText='margin:16px auto;display:block;padding:12px 24px;width:auto'; eb.textContent='Publier '; emptyHtml.appendChild(eb);
              eb.addEventListener('click', function(){ var pb=document.querySelector('.bnav-post-btn'); if(pb) pb.click(); });
              emptyEl.innerHTML=''; emptyEl.appendChild(emptyHtml);
            }
            return;
          }

          /* FIX: null-check avant accès à .style (snap non vide mais élément absent du DOM) */
          var feedEmpty = q('feed-empty');
          if (feedEmpty) feedEmpty.style.display = 'none';
          fd.lastDoc = snap.docs[snap.docs.length - 1];
          if (snap.docs.length < fd.PAGE_SIZE) fd.noMore = true;

          var list = q('posts-list');
          snap.docs.forEach(function (doc) {
            var el = renderPost(doc);
            list.appendChild(el);
          });
        })
        .catch(function (err) {
          fd.loading = false;
          if (q('feed-skeletons')) q('feed-skeletons').style.display = 'none';
          console.warn('Feed load error:', err);
          /* Erreur index Firestore probable - retry sans filtre */
          if (err.code === 'failed-precondition' || err.message && err.message.indexOf('index') > -1) {
            fd.currentTab = 'global'; fd.currentMood = '';
            SIS.toast && SIS.toast.info('Chargement simplifié', 'Index en cours de création');
          }
        });
    }

    /* ── INFINITE SCROLL ── */
    function initInfiniteScroll() {
      if (!window.IntersectionObserver) return;
      var sentinel = q('feed-sentinel');
      var obs = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting && !fd.loading && !fd.noMore) {
          q('feed-loader').style.display = 'flex';
          loadPosts(false);
        }
      }, { threshold: 0.5 });
      obs.observe(sentinel);
    }

    /* ── STORIES ── */
    function loadStories() {
      if (fd.unsubStories) { fd.unsubStories(); fd.unsubStories = null; }

      /* Stories des dernières 24h */
      var expiry = new Date(Date.now() - 86400000);
      fd.unsubStories = SIS.db.collection('stories')
        .where('createdAt', '>', firebase.firestore.Timestamp.fromDate(expiry))
        .orderBy('createdAt', 'desc')
        .limit(20)
        .onSnapshot(function(snap) {
          var list = q('stories-list');
          list.innerHTML = '';

          /* Mon avatar en premier */
          SIS.authHelper.getProfile(user.uid).then(function(profile) {
            if (profile && q('avatar-initials')) {
              /* Met à jour l'avatar du bouton "ma story" dans la topbar profil */
            }
          });

          snap.forEach(function(doc) {
            var d = doc.data();
            if (d.authorUid === user.uid) return; /* La propre story est dans le btn */

            /* FIX: l'ancien bloc 'item' utilisait .replace('</div>','') qui supprimait
               le premier </div> trouvé (mauvais div), produisant du HTML invalide.
               Ce bloc était du code mort (item n'était jamais appendé). Supprimé. */
            var ring = document.createElement('div');
            ring.className = 'story-item';
            ring.setAttribute('data-story-id', doc.id);

            var ringWrap = document.createElement('div');
            ringWrap.className = 'story-ring' + (d.seenBy && user && d.seenBy[user.uid] ? ' seen' : '');

            var av = document.createElement('div');
            av.className = 'story-av';
            if (d.authorPhoto) {
              av.style.backgroundImage = 'url(' + SIS.cloudinary.url(d.authorPhoto, 'avatar') + ')';
              av.style.backgroundSize = 'cover';
              av.style.backgroundPosition = 'center';
            } else {
              av.textContent = (d.authorPseudo||'?').charAt(0).toUpperCase();
              av.style.background = SIS.utils.pseudoToGradient(d.authorPseudo||'');
              av.style.color = '#fff';
              av.style.display = 'flex';
              av.style.alignItems = 'center';
              av.style.justifyContent = 'center';
              av.style.fontWeight = '700';
              av.style.fontSize = '16px';
            }

            ringWrap.appendChild(av);
            ring.appendChild(ringWrap);

            var lbl = document.createElement('span');
            lbl.className = 'story-label';
            lbl.textContent = SIS.utils.truncate(d.authorPseudo||'?', 8);
            ring.appendChild(lbl);

            ring.addEventListener('click', function() { openStoryViewer(doc.id, d); });
            list.appendChild(ring);
          });
        }, function(err) { console.warn('Stories err:', err); });
    }

    /* ── STORY VIEWER ── */
    function openStoryViewer(storyId, data) {
      var viewer = q('story-viewer');
      viewer.style.display = 'flex';

      /* Avatar */
      var avZone = q('story-viewer-av');
      avZone.innerHTML = SIS.renderAvatar({
        pseudo: data.authorPseudo||'?',
        photoUrl: data.authorPhoto||null,
        certified: data.authorCertified||false,
        size: 'sm',
        gradient: SIS.utils.pseudoToGradient(data.authorPseudo||'')
      });
      SIS.bindAvatarClicks(avZone);

      q('story-viewer-pseudo').textContent = data.authorPseudo || '?';
      q('story-viewer-time').textContent = SIS.utils.timeAgo(data.createdAt);

      /* Contenu */
      var content = q('story-content');
      content.innerHTML = '';
      var bg = document.createElement('div');
      bg.className = 'story-bg';
      bg.style.background = data.bg || 'linear-gradient(135deg,#5B8EF4,#8B5CF6)';
      content.appendChild(bg);

      if (data.imageUrl) {
        var img = document.createElement('img');
        img.src = SIS.cloudinary.url(data.imageUrl, 'story');
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1';
        content.appendChild(img);
      }

      if (data.text) {
        var txt = document.createElement('div');
        txt.className = 'story-text-display';
        txt.textContent = data.text;
        txt.style.zIndex = '2';
        content.appendChild(txt);
      }

      /* Progress bar */
      var pbars = q('story-progress-bars');
      pbars.innerHTML = '<div class="story-progress-bar"><div class="story-progress-fill active" style="animation-duration:5s"></div></div>';

      /* Marquer comme vu */
      SIS.db.collection('stories').doc(storyId).update({
        ['seenBy.' + user.uid]: true,
        viewCount: firebase.firestore.FieldValue.increment(1)
      }).catch(function(){});

      /* Auto-close après 5s */
      var autoClose = setTimeout(function() {
        q('story-viewer').style.display = 'none';
      }, 5200);

      q('story-close').onclick = function() {
        clearTimeout(autoClose);
        q('story-viewer').style.display = 'none';
      };
    }

    /* ── COMPOSER ── */
    function openComposer() {
      showOverlay('post-composer-overlay');
      q('post-text') && q('post-text').focus();
    }

    function closeComposer() {
      hideOverlay('post-composer-overlay');
      resetComposer();
    }

    function resetComposer() {
      fd.postType   = 'confession';
      fd.identity   = 'anon';
      fd.mediaFile  = null;
      fd.mediaGifUrl= null;
      fd.threadBlocks = 1;

      qsa('.ctype').forEach(function(c){ c.classList.toggle('active', c.getAttribute('data-type')==='confession'); });
      qsa('.identity-opt', q('post-composer')).forEach(function(o){ o.classList.toggle('active', o.getAttribute('data-identity')==='anon'); });
      qsa('.composer-field').forEach(function(f){ f.style.display='none'; });
      var tf = q('field-text'); if(tf) tf.style.display='block';
      var pt = q('post-text'); if(pt){ pt.value=''; }
      var cc = q('char-count'); if(cc) cc.textContent='0';
      var pub = q('btn-publish'); if(pub) pub.disabled=true;
    }

    function switchComposerType(type) {
      fd.postType = type;
      qsa('.ctype').forEach(function(c){ c.classList.toggle('active', c.getAttribute('data-type')===type); });

      var allFields = ['field-text','field-battle','field-poll','field-burn','field-media','field-thread'];
      allFields.forEach(function(f){ var e=q(f); if(e) e.style.display='none'; });

      var map = {
        confession:'field-text', csdpm:'field-text', whisper:'field-text',
        battle:'field-battle', poll:'field-poll', burn:'field-burn',
        media:'field-media', thread:'field-thread'
      };
      var target = map[type] || 'field-text';
      var te = q(target); if(te) te.style.display='block';

      /* Mood visible sauf pour battle/poll */
      var moodEl = q('composer-mood');
      if (moodEl) moodEl.style.display = (type==='battle'||type==='poll') ? 'none' : 'block';

      checkPublishReady();
    }

    function checkPublishReady() {
      var ready = false;
      var type = fd.postType;

      if (type==='confession'||type==='csdpm'||type==='whisper') {
        ready = (q('post-text').value.trim().length > 0);
      } else if (type==='burn') {
        ready = (q('burn-text') && q('burn-text').value.trim().length > 0);
      } else if (type==='battle') {
        var bq = q('battle-question');
        var bopts = qsa('.battle-opt-input');
        ready = bq && bq.value.trim().length > 0 &&
          bopts.length >= 2 && bopts.every(function(o){ return o.value.trim().length>0; });
      } else if (type==='poll') {
        var pq = q('poll-question');
        var popts = qsa('.poll-opt-input');
        ready = pq && pq.value.trim().length > 0 &&
          popts.length >= 2 && popts.every(function(o){ return o.value.trim().length>0; });
      } else if (type==='media') {
        ready = fd.mediaFile !== null || fd.mediaGifUrl !== null;
      } else if (type==='thread') {
        var blocks = qsa('.thread-block-textarea');
        ready = blocks.length > 0 && blocks[0].value.trim().length > 0;
      }

      var pub = q('btn-publish'); if(pub) pub.disabled = !ready;
    }

    /* ── PUBLIER ── */
    function publish() {
      if (!SIS.security.rateLimit('publish', 5)) {
        SIS.toast.warning('Trop vite', 'Attends un peu entre chaque publication.');
        return;
      }

      openPacte(function() { doPublish(); });
    }

    function doPublish() {
      var type = fd.postType;
      var identity = fd.identity;
      var now = firebase.firestore.FieldValue.serverTimestamp();

      /* Données de base */
      var postData = {
        type:            type,
        identity:        identity,
        authorUid:       identity !== 'anon' ? user.uid : null,
        /* FIX: la ternaire 'identity !== 'anon' ? null : null' retournait null dans
           les DEUX cas — l'auteur n'était jamais identifié. Corrigé : null par défaut,
           la valeur est renseignée juste après par profilePromise si besoin. */
        authorPseudo:    null,
        authorPhoto:     null,
        authorCertified: false,
        authorCountry:   null,
        mood:            getSelectedMood(),
        hidden:          false,
        reportCount:     0,
        commentsCount:   0,
        echoCount:       0,
        reactions:       {},
        createdAt:       now
      };

      /* Si identité révélée, ajouter les infos */
      if (identity === 'name' || identity === 'mystery') {
        postData.authorUid = user.uid;
        /* On va chercher le profil */
      }

      /* Contenu selon type */
      if (type==='confession'||type==='csdpm'||type==='whisper') {
        postData.text = q('post-text').value.trim();
      } else if (type==='burn') {
        postData.text = q('burn-text').value.trim();
        postData.burnMaxViews = fd.burnViews;
        postData.viewCount    = 0;
        var burnExpiry = new Date(Date.now() + fd.burnTimer * 1000);
        postData.burnExpiresAt = firebase.firestore.Timestamp.fromDate(burnExpiry);
      } else if (type==='battle') {
        postData.question = q('battle-question').value.trim();
        postData.options  = qsa('.battle-opt-input').map(function(i){ return {text:i.value.trim(), votes:0}; });
        postData.duration = fd.battleDur;
        postData.endsAt   = firebase.firestore.Timestamp.fromDate(new Date(Date.now()+fd.battleDur*1000));
      } else if (type==='poll') {
        postData.question = q('poll-question').value.trim();
        postData.options  = qsa('.poll-opt-input').map(function(i){ return {text:i.value.trim(), votes:0}; });
      } else if (type==='thread') {
        postData.blocks = qsa('.thread-block-textarea').map(function(t){ return t.value.trim(); }).filter(Boolean);
      }

      /* Récupérer profil si besoin */
      var profilePromise = (identity === 'name' || identity === 'mystery')
        ? SIS.authHelper.getProfile(user.uid)
        : Promise.resolve(null);

      q('btn-publish').disabled = true;
      var loader = q('btn-publish');
      loader.textContent = '…';

      profilePromise.then(function(profile) {
        if (profile) {
          if (identity === 'name') {
            postData.authorPseudo    = profile.pseudo;
            postData.authorPhoto     = profile.photoUrl;
            postData.authorCertified = profile.certified || false;
          } else if (identity === 'mystery') {
            postData.authorPseudo = '🎭 Mystère';
          }
        }

        /* Upload media si besoin */
        if (type === 'media' && fd.mediaFile) {
          return SIS.image.processAndUpload(fd.mediaFile, { type: 'post' })
            .then(function(result) {
              postData.mediaUrl = result.publicId;
              postData.caption  = q('media-caption') ? q('media-caption').value.trim() : '';
              return postData;
            });
        } else if (type === 'media' && fd.mediaGifUrl) {
          postData.gifUrl  = fd.mediaGifUrl;
          postData.caption = q('media-caption') ? q('media-caption').value.trim() : '';
          return postData;
        }
        return postData;
      })
      .then(function(data) {
        return SIS.db.collection('posts').add(data);
      })
      .then(function() {
        SIS.toast.success(SIS.i18n.t('post_success'));
        closeComposer();
        loadPosts(true);
        /* Incrémenter postsCount */
        SIS.db.collection('users').doc(user.uid).update({
          postsCount: firebase.firestore.FieldValue.increment(1)
        }).catch(function(){});
      })
      .catch(function(err) {
        console.warn('Publish error:', err);
        SIS.toast.error(SIS.i18n.t('post_error'));
        var pub = q('btn-publish');
        if(pub){ pub.disabled=false; pub.textContent='Publier'; }
      });
    }

    function getSelectedMood() {
      var active = qs('.composer-mood .mood-chip.active');
      return active ? active.getAttribute('data-mood') : '';
    }

    /* ── LE PACTE ── */
    function openPacte(callback) {
      fd.pacteCallback = callback;

      /* Charger un post aléatoire */
      SIS.db.collection('posts')
        .where('hidden','==',false)
        .orderBy('createdAt','desc')
        .limit(20)
        .get()
        .then(function(snap) {
          if (snap.empty) { callback(); return; }
          var idx = Math.floor(Math.random() * snap.docs.length);
          var d = snap.docs[idx].data();
          var prev = q('pacte-post-preview');
          if (prev) prev.textContent = SIS.utils.truncate(d.text||d.question||'', 120);
        });

      showOverlay('pacte-overlay');

      /* Skip button enabler après 2s */
      var skipBtn = q('pacte-skip');
      if (skipBtn) skipBtn.disabled = true;
      fd.pacteSkipTimer = setTimeout(function() {
        var sb = q('pacte-skip');
        if (sb) { sb.disabled=false; sb.textContent='Passer →'; }
      }, 2000);
    }

    function closePacte(reactEmoji) {
      clearTimeout(fd.pacteSkipTimer);
      hideOverlay('pacte-overlay');
      if (reactEmoji) {
        /* Petite animation de réaction */
        var btn = qs('[data-r="' + reactEmoji + '"]', q('pacte-card'));
        if (btn) {
          btn.style.transform = 'scale(1.4)';
          setTimeout(function(){ btn.style.transform=''; }, 300);
        }
      }
      if (typeof fd.pacteCallback === 'function') {
        var cb = fd.pacteCallback;
        fd.pacteCallback = null;
        setTimeout(cb, 300);
      }
    }

    /* ── RÉACTIONS ── */
    function handleReaction(postId, emoji, x, y) {
      if (!SIS.security.rateLimit('react', 20)) return;

      /* Reaction Storm */
      SIS.reactionStorm(emoji, x, y);

      /* Incrémenter dans Firestore */
      var update = {};
      update['reactions.' + emoji] = firebase.firestore.FieldValue.increment(1);
      SIS.db.collection('posts').doc(postId).update(update)
        .catch(function(){});

      /* Notifier l'auteur */
      SIS.db.collection('posts').doc(postId).get().then(function(doc) {
        if (doc.exists && doc.data().authorUid && doc.data().authorUid !== user.uid) {
          SIS.notifs.push(doc.data().authorUid, SIS.notifs.TYPES.LIKE, {
            fromPseudo: null,
            postId: postId,
            emoji: emoji
          });
        }
      });
    }

    /* ── VOTE BATTLE / POLL ── */
    function handleVote(postId, optIdx, type) {
      if (!SIS.security.rateLimit('vote', 10)) return;
      var voteKey = 'vote_' + postId;
      if (localStorage.getItem(voteKey)) {
        SIS.toast.info('Déjà voté', 'Tu as déjà voté sur ce ' + type + '.');
        return;
      }
      localStorage.setItem(voteKey, optIdx);
      var update = {};
      update['options.' + optIdx + '.votes'] = firebase.firestore.FieldValue.increment(1);
      SIS.db.collection('posts').doc(postId).update(update)
        .then(function() { loadPosts(true); })
        .catch(function(){});
    }

    /* ── COMMENTAIRES ── */
    function openComments(postId) {
      fd.commentPostId = postId;
      showOverlay('comments-overlay');

      /* Aperçu du post */
      SIS.db.collection('posts').doc(postId).get().then(function(doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var prev = q('comment-post-preview');
        if (prev) prev.innerHTML = '<div style="font-size:12px;color:var(--text2);line-height:1.5">' +
          SIS.utils.parseText(SIS.utils.truncate(d.text||d.question||'', 100)) + '</div>';
      });

      /* Avatar user pour le composer */
      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        var avZone = q('comment-my-av');
        if (avZone && profile) {
          avZone.innerHTML = SIS.renderAvatar({
            pseudo: profile.pseudo||'?',
            photoUrl: profile.photoUrl||null,
            certified: profile.certified||false,
            size: 'sm',
            gradient: SIS.utils.pseudoToGradient(profile.pseudo||'')
          });
        }
      });

      /* Charger commentaires */
      var list = q('comments-list');
      list.innerHTML = '<div class="skeleton" style="height:50px;border-radius:10px;margin-bottom:8px"></div><div class="skeleton" style="height:50px;border-radius:10px"></div>';

      SIS.db.collection('posts').doc(postId).collection('comments')
        .orderBy('createdAt','asc').limit(30).get()
        .then(function(snap) {
          list.innerHTML = '';
          if (snap.empty) {
            list.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:13px;padding:20px">Sois le premier à commenter !</p>';
            return;
          }
          snap.forEach(function(doc) {
            var c = doc.data();
            var item = document.createElement('div');
            item.className = 'comment-item';
            item.innerHTML =
              SIS.renderAvatar({ pseudo: c.pseudo||'?', photoUrl: c.photoUrl||null, certified: c.certified||false, size:'xs', gradient: SIS.utils.pseudoToGradient(c.pseudo||'') }) +
              '<div class="comment-bubble">' +
                '<div class="comment-meta">' +
                  '<span class="comment-pseudo">' + SIS.utils.escHtml(c.pseudo||'Anonyme') + '</span>' +
                  '<span class="comment-time">' + SIS.utils.timeAgo(c.createdAt) + '</span>' +
                '</div>' +
                '<div class="comment-text">' + SIS.utils.parseText(c.text||'') + '</div>' +
              '</div>';
            list.appendChild(item);
          });
          list.scrollTop = list.scrollHeight;
        });
    }

    function sendComment() {
      var input = q('comment-input');
      var text  = input.value.trim();
      if (!text || !fd.commentPostId) return;
      if (!SIS.security.rateLimit('comment', 10)) {
        SIS.toast.warning('Trop vite !');
        return;
      }

      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        return SIS.db.collection('posts').doc(fd.commentPostId)
          .collection('comments').add({
            text:      text,
            pseudo:    profile ? profile.pseudo : null,
            photoUrl:  profile ? profile.photoUrl : null,
            certified: profile ? profile.certified : false,
            authorUid: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          })
          .then(function() {
            return SIS.db.collection('posts').doc(fd.commentPostId).update({
              commentsCount: firebase.firestore.FieldValue.increment(1)
            });
          })
          .then(function() {
            input.value = '';
            openComments(fd.commentPostId); /* Refresh */
            /* Notif auteur */
            SIS.db.collection('posts').doc(fd.commentPostId).get().then(function(doc){
              if(doc.exists && doc.data().authorUid && doc.data().authorUid !== user.uid){
                SIS.notifs.push(doc.data().authorUid, SIS.notifs.TYPES.COMMENT, {
                  fromPseudo: profile ? profile.pseudo : null,
                  postId: fd.commentPostId
                });
              }
            });
          });
      }).catch(function(){ SIS.toast.error('Erreur envoi commentaire'); });
    }

    /* ── ECHO ── */
    function openEcho(postId) {
      fd.echoPostId = postId;
      showOverlay('echo-overlay');

      SIS.db.collection('posts').doc(postId).get().then(function(doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var prev = q('echo-preview');
        if (prev) prev.innerHTML = '<div style="font-size:12px;color:var(--text2)">' +
          SIS.utils.parseText(SIS.utils.truncate(d.text||d.question||'',100)) + '</div>';
      });
    }

    function confirmEcho() {
      if (!fd.echoPostId) return;
      var echoText = q('echo-text').value.trim();
      var identity = qs('.echo-sheet .identity-opt.active');
      var echoIdentity = identity ? identity.getAttribute('data-identity') : 'anon';

      SIS.db.collection('posts').doc(fd.echoPostId).get().then(function(orig) {
        if (!orig.exists) return;
        var od = orig.data();

        var profilePromise = echoIdentity !== 'anon'
          ? SIS.authHelper.getProfile(user.uid)
          : Promise.resolve(null);

        profilePromise.then(function(profile) {
          return SIS.db.collection('posts').add({
            type:              'echo_' + od.type,
            identity:          echoIdentity,
            authorUid:         echoIdentity !== 'anon' ? user.uid : null,
            authorPseudo:      echoIdentity === 'name' && profile ? profile.pseudo : (echoIdentity === 'mystery' ? '🎭' : null),
            authorPhoto:       echoIdentity === 'name' && profile ? profile.photoUrl : null,
            authorCertified:   echoIdentity === 'name' && profile ? profile.certified : false,
            echoOf:            fd.echoPostId,
            echoOriginalText:  od.text || od.question || '',
            echoOriginalPseudo:od.authorPseudo || 'Anonyme',
            text:              echoText,
            hidden:            false,
            reportCount:       0,
            commentsCount:     0,
            echoCount:         0,
            reactions:         {},
            mood:              '',
            createdAt:         firebase.firestore.FieldValue.serverTimestamp()
          });
        }).then(function() {
          return SIS.db.collection('posts').doc(fd.echoPostId).update({
            echoCount: firebase.firestore.FieldValue.increment(1)
          });
        }).then(function() {
          hideOverlay('echo-overlay');
          SIS.toast.success('Echo publié !');
          loadPosts(true);
        }).catch(function(){ SIS.toast.error('Erreur echo'); });
      });
    }

    /* ── OPTIONS POST ── */
    function openPostOptions(postId) {
      SIS.db.collection('posts').doc(postId).get().then(function(doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var isOwn = d.authorUid === user.uid;
        var list = q('post-options-list');
        list.innerHTML = '';

        var opts = [];
        opts.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>', label:'Partager', action:'share' });
        opts.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', label:'Copier le lien', action:'copy' });

        if (isOwn) {
          opts.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>', label:'Supprimer', action:'delete', danger:true });
        } else {
          opts.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', label:'Signaler', action:'report', danger:true });
        }

        opts.forEach(function(opt) {
          var item = document.createElement('div');
          item.className = 'post-option-item' + (opt.danger ? ' danger' : '');
          item.innerHTML = opt.icon + '<span>' + opt.label + '</span>';
          item.addEventListener('click', function() {
            hideOverlay('post-options-overlay');
            if (opt.action === 'share') {
              SIS.utils.share({ title: 'Post SIS', url: window.location.origin + '/feed.html?post=' + postId });
            } else if (opt.action === 'copy') {
              SIS.utils.copyToClipboard(window.location.origin + '/feed.html?post=' + postId)
                .then(function(){ SIS.toast.success(SIS.i18n.t('copy_success')); });
            } else if (opt.action === 'delete') {
              SIS.db.collection('posts').doc(postId).update({ hidden: true })
                .then(function(){ SIS.toast.success('Post supprimé'); loadPosts(true); });
            } else if (opt.action === 'report') {
              SIS.security.report(d.authorUid||'', postId, 'posts', 'Contenu inapproprié')
                .then(function(){ SIS.toast.success(SIS.i18n.t('report_sent')); });
            }
          });
          list.appendChild(item);
        });

        /* Separateur + Annuler */
        var cancel = document.createElement('div');
        cancel.className = 'post-option-item';
        cancel.innerHTML = '<span style="color:var(--muted)">Annuler</span>';
        cancel.addEventListener('click', function(){ hideOverlay('post-options-overlay'); });
        list.appendChild(cancel);

        showOverlay('post-options-overlay');
      });
    }

    /* ── CONFESSION ROULETTE ── */
    function openRoulette() {
      showOverlay('roulette-overlay');
      fd.rouletteIdx = 0;
      SIS.db.collection('posts').where('hidden','==',false)
        .orderBy('createdAt','desc').limit(30).get()
        .then(function(snap) {
          fd.roulettePosts = snap.docs;
          showRoulettePost();
        });
    }

    function showRoulettePost() {
      if (fd.roulettePosts.length === 0) return;
      var idx = Math.floor(Math.random() * fd.roulettePosts.length);
      var doc = fd.roulettePosts[idx];
      var wrap = q('roulette-post-wrap');
      if (wrap) {
        wrap.innerHTML = '';
        wrap.appendChild(renderPost(doc));
        SIS.bindAvatarClicks(wrap);
      }
    }

    /* ── GIF SEARCH (Tenor) ── */
    var gifSearch = SIS.utils.debounce(function(query) {
      if (!query) { q('gif-results').innerHTML = ''; return; }
      var url = 'https://tenor.googleapis.com/v2/search?q=' + encodeURIComponent(query) +
        '&key=' + fd.TENOR_KEY + '&limit=12&media_filter=gif';
      fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(data) {
          var results = q('gif-results');
          if (!results) return;
          results.innerHTML = '';
          (data.results || []).forEach(function(item) {
            var gif = item.media_formats && item.media_formats.tinygif
              ? item.media_formats.tinygif.url
              : null;
            if (!gif) return;
            var el = document.createElement('div');
            el.className = 'gif-item';
            el.innerHTML = '<img src="' + gif + '" loading="lazy" alt="GIF">';
            el.addEventListener('click', function() {
              fd.mediaGifUrl = gif;
              /* Preview */
              var prev = q('media-preview');
              if (prev) { prev.src=gif; prev.style.display='block'; }
              checkPublishReady();
              SIS.toast.success('GIF sélectionné !');
            });
            results.appendChild(el);
          });
        })
        .catch(function(){ SIS.toast.error('Erreur recherche GIF'); });
    }, 500);

    /* ── BIND EVENTS ── */
    function bindEvents() {
      /* Tabs */
      qsa('.tab-item', q('feed-tabs')).forEach(function(tab) {
        tab.addEventListener('click', function() {
          qsa('.tab-item').forEach(function(t){ t.classList.remove('active'); });
          tab.classList.add('active');
          fd.currentTab = tab.getAttribute('data-tab');
          /* Nettoyer listener stories avant reload */
          if (fd.unsubStories) { fd.unsubStories(); fd.unsubStories = null; }
          loadPosts(true);
          loadStories();
        });
      });

      /* Mood */
      qsa('.mood-chip', q('mood-bar')).forEach(function(chip) {
        chip.addEventListener('click', function() {
          qsa('.mood-chip', q('mood-bar')).forEach(function(c){ c.classList.remove('active'); });
          chip.classList.add('active');
          fd.currentMood = chip.getAttribute('data-mood');
          loadPosts(true);
        });
      });

      /* Composer post — ouverture via bottom nav */
      SIS.onPostClick = openComposer;
      q('composer-close') && q('composer-close').addEventListener('click', closeComposer);

      /* Types */
      qsa('.ctype').forEach(function(ct) {
        ct.addEventListener('click', function(){ switchComposerType(ct.getAttribute('data-type')); });
      });

      /* Identity */
      qsa('.identity-opt', q('post-composer')).forEach(function(opt) {
        opt.addEventListener('click', function() {
          qsa('.identity-opt', q('post-composer')).forEach(function(o){ o.classList.remove('active'); });
          opt.classList.add('active');
          fd.identity = opt.getAttribute('data-identity');
        });
      });

      /* Texte → check ready */
      ['post-text','burn-text','battle-question','poll-question'].forEach(function(id) {
        var el = q(id);
        if (el) {
          el.addEventListener('input', function() {
            var cc = q('char-count');
            if (cc && id==='post-text') cc.textContent = this.value.length;
            checkPublishReady();
          });
        }
      });

      /* Ajouter option battle */
      q('add-battle-opt') && q('add-battle-opt').addEventListener('click', function() {
        var opts = qsa('.battle-opt-input');
        if (opts.length >= 4) { SIS.toast.info('Maximum 4 options'); return; }
        var inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'battle-opt-input';
        inp.placeholder = 'Option ' + String.fromCharCode(65 + opts.length);
        inp.maxLength = 80;
        inp.addEventListener('input', checkPublishReady);
        q('battle-options').appendChild(inp);
      });

      /* Ajouter option poll */
      q('add-poll-opt') && q('add-poll-opt').addEventListener('click', function() {
        var opts = qsa('.poll-opt-input');
        if (opts.length >= 4) { SIS.toast.info('Maximum 4 options'); return; }
        var inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'poll-opt-input';
        inp.placeholder = 'Option ' + (opts.length + 1);
        inp.maxLength = 80;
        inp.addEventListener('input', checkPublishReady);
        q('poll-options').appendChild(inp);
      });

      /* Battle duration */
      qsa('.dur-opt').forEach(function(o) {
        o.addEventListener('click', function() {
          qsa('.dur-opt').forEach(function(x){ x.classList.remove('active'); });
          o.classList.add('active');
          fd.battleDur = parseInt(o.getAttribute('data-dur'), 10);
        });
      });

      /* Burn settings */
      qsa('.burn-opt[data-views]').forEach(function(o) {
        o.addEventListener('click', function() {
          qsa('.burn-opt[data-views]').forEach(function(x){ x.classList.remove('active'); });
          o.classList.add('active');
          fd.burnViews = parseInt(o.getAttribute('data-views'), 10);
        });
      });
      qsa('.burn-opt[data-timer]').forEach(function(o) {
        o.addEventListener('click', function() {
          qsa('.burn-opt[data-timer]').forEach(function(x){ x.classList.remove('active'); });
          o.classList.add('active');
          fd.burnTimer = parseInt(o.getAttribute('data-timer'), 10);
        });
      });

      /* Thread blocs */
      q('add-thread-block') && q('add-thread-block').addEventListener('click', function() {
        var blocks = qsa('.thread-block-composer');
        if (blocks.length >= 10) { SIS.toast.info('Maximum 10 blocs'); return; }
        fd.threadBlocks++;
        var block = document.createElement('div');
        block.className = 'thread-block-composer';
        block.innerHTML =
          '<div class="thread-block-num-label">Bloc ' + fd.threadBlocks + '</div>' +
          '<textarea class="thread-block-textarea" placeholder="Bloc ' + fd.threadBlocks + '…" maxlength="500" rows="3"></textarea>';
        block.querySelector('textarea').addEventListener('input', checkPublishReady);
        q('thread-blocks').appendChild(block);
      });

      /* Media tabs */
      qsa('.media-tab').forEach(function(t) {
        t.addEventListener('click', function() {
          qsa('.media-tab').forEach(function(x){ x.classList.remove('active'); });
          t.classList.add('active');
          fd.mediaMode = t.getAttribute('data-media');
          q('media-image-zone').style.display = fd.mediaMode==='image' ? 'block' : 'none';
          q('media-gif-zone').style.display   = fd.mediaMode==='gif'   ? 'block' : 'none';
        });
      });

      /* Upload image media */
      q('media-upload-zone') && q('media-upload-zone').addEventListener('click', function() {
        q('media-file-input').click();
      });
      q('media-file-input') && q('media-file-input').addEventListener('change', function() {
        var file = this.files && this.files[0];
        if (!file) return;
        fd.mediaFile = file;
        /* Preview */
        var reader = new FileReader();
        reader.onload = function(e) {
          var prev = q('media-preview');
          if (prev) { prev.src=e.target.result; prev.style.display='block'; }
        };
        reader.readAsDataURL(file);
        checkPublishReady();
      });

      /* GIF search */
      q('gif-search-input') && q('gif-search-input').addEventListener('input', function() {
        gifSearch(this.value.trim());
      });

      /* Publier */
      q('btn-publish') && q('btn-publish').addEventListener('click', publish);

      /* Mood dans composer */
      qsa('.composer-mood .mood-chip').forEach(function(c) {
        c.addEventListener('click', function() {
          qsa('.composer-mood .mood-chip').forEach(function(x){ x.classList.remove('active'); });
          c.classList.add('active');
        });
      });

      /* Pacte */
      qsa('.pacte-react').forEach(function(btn) {
        btn.addEventListener('click', function() { closePacte(btn.getAttribute('data-r')); });
      });
      q('pacte-skip') && q('pacte-skip').addEventListener('click', function() { closePacte(null); });

      /* Roulette */
      q('btn-roulette') && q('btn-roulette').addEventListener('click', openRoulette);
      q('roulette-close') && q('roulette-close').addEventListener('click', function(){ hideOverlay('roulette-overlay'); });
      q('btn-roulette-next') && q('btn-roulette-next').addEventListener('click', showRoulettePost);

      /* Commentaires */
      q('comments-close') && q('comments-close').addEventListener('click', function(){ hideOverlay('comments-overlay'); });
      q('comment-send') && q('comment-send').addEventListener('click', sendComment);
      q('comment-input') && q('comment-input').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); sendComment(); } });

      /* Echo */
      q('btn-echo-confirm') && q('btn-echo-confirm').addEventListener('click', confirmEcho);
      q('btn-echo-cancel') && q('btn-echo-cancel').addEventListener('click', function(){ hideOverlay('echo-overlay'); });
      qsa('.echo-sheet .identity-opt').forEach(function(opt) {
        opt.addEventListener('click', function() {
          qsa('.echo-sheet .identity-opt').forEach(function(o){ o.classList.remove('active'); });
          opt.classList.add('active');
        });
      });

      /* Post options overlay backdrop */
      q('post-options-overlay') && q('post-options-overlay').addEventListener('click', function(e){
        if(e.target===this) hideOverlay('post-options-overlay');
      });
      q('comments-overlay') && q('comments-overlay').addEventListener('click', function(e){
        if(e.target===this) hideOverlay('comments-overlay');
      });
      q('echo-overlay') && q('echo-overlay').addEventListener('click', function(e){
        if(e.target===this) hideOverlay('echo-overlay');
      });

      /* Story add */
      q('story-add-btn') && q('story-add-btn').addEventListener('click', function(){ showOverlay('story-composer-overlay'); });
      q('story-composer-close') && q('story-composer-close').addEventListener('click', function(){ hideOverlay('story-composer-overlay'); });

      /* Story bg picker */
      qsa('.story-bg-opt').forEach(function(opt) {
        opt.addEventListener('click', function() {
          qsa('.story-bg-opt').forEach(function(o){ o.classList.remove('active'); });
          opt.classList.add('active');
          fd.storyBg = opt.getAttribute('data-bg');
          var bg = q('story-preview-bg');
          if (bg) bg.style.background = fd.storyBg;
        });
      });

      /* Story text input preview */
      q('story-text-input') && q('story-text-input').addEventListener('input', function() {
        var disp = q('story-text-display');
        if (disp) disp.textContent = this.value || 'Écris quelque chose…';
      });

      /* Story photo */
      q('btn-story-photo') && q('btn-story-photo').addEventListener('click', function(){ q('story-photo-input').click(); });

      /* Story publish */
      q('btn-story-publish') && q('btn-story-publish').addEventListener('click', publishStory);

      /* Theme toggle */
      q('btn-theme') && q('btn-theme').addEventListener('click', function(){
        SIS.theme.toggle();
        updateThemeIcon();
      });

      /* Délégation pour actions sur les posts */
      q('posts-list') && q('posts-list').addEventListener('click', function(e) {
        var target = e.target;

        /* Bouton options (3 points) */
        var moreBtn = target.closest('.post-more-btn');
        if (moreBtn) { openPostOptions(moreBtn.getAttribute('data-id')); return; }

        /* Actions bar */
        var action = target.closest('.post-action');
        if (action) {
          var id  = action.getAttribute('data-id');
          var act = action.getAttribute('data-action');
          if (act==='comment') openComments(id);
          else if (act==='echo') openEcho(id);
          else if (act==='react') {
            /* Afficher le picker de réactions */
            showReactionPicker(id, e.clientX, e.clientY);
          }
          else if (act==='share') {
            SIS.utils.share({ title: 'Post SIS', url: window.location.origin + '/feed.html?post=' + id })
              .then(function(){ SIS.toast.success(SIS.i18n.t('copy_success')); });
          }
          return;
        }

        /* Reaction pill */
        var rPill = target.closest('.reaction-pill');
        if (rPill) {
          handleReaction(rPill.getAttribute('data-post'), rPill.getAttribute('data-emoji'), e.clientX, e.clientY);
          return;
        }

        /* Battle option vote */
        var bOpt = target.closest('.battle-opt');
        if (bOpt) { handleVote(bOpt.getAttribute('data-post'), parseInt(bOpt.getAttribute('data-idx'),10), 'battle'); return; }

        /* Poll option vote */
        var pOpt = target.closest('.poll-opt');
        if (pOpt) { handleVote(pOpt.getAttribute('data-post'), parseInt(pOpt.getAttribute('data-idx'),10), 'poll'); return; }
      });
    }

    /* ── REACTION PICKER ── */
    function showReactionPicker(postId, x, y) {
      /* Supprimer picker précédent */
      var old = document.getElementById('reaction-picker');
      if (old) old.parentNode.removeChild(old);

      var picker = document.createElement('div');
      picker.id = 'reaction-picker';
      picker.style.cssText = 'position:fixed;left:' + Math.min(x-80, window.innerWidth-180) + 'px;top:' + (y-50) + 'px;' +
        'background:var(--card);border:1px solid var(--border2);border-radius:999px;padding:6px 10px;' +
        'display:flex;gap:8px;z-index:800;box-shadow:var(--shadow-md);animation:scaleIn 0.15s ease both';
      picker.innerHTML = ['❤️','❤️‍🔥','😂','😮','😢','😡'].map(function(e){
        return '<span style="font-size:20px;cursor:pointer;transition:transform 0.1s" data-e="'+e+'">' + e + '</span>';
      }).join('');

      picker.addEventListener('click', function(ev) {
        var span = ev.target.closest('[data-e]');
        if (span) {
          handleReaction(postId, span.getAttribute('data-e'), x, y);
          picker.parentNode.removeChild(picker);
        }
      });

      document.body.appendChild(picker);

      /* Auto-close */
      setTimeout(function() {
        var p = document.getElementById('reaction-picker');
        if (p) p.parentNode.removeChild(p);
      }, 3000);

      /* Fermer au clic ailleurs */
      var closeOnOut = function(e) {
        if (!picker.contains(e.target)) {
          var p = document.getElementById('reaction-picker');
          if (p) p.parentNode.removeChild(p);
          document.removeEventListener('click', closeOnOut);
        }
      };
      setTimeout(function(){ document.addEventListener('click', closeOnOut); }, 100);
    }

    /* ── PUBLIER STORY ── */
    function publishStory() {
      var text = q('story-text-input') ? q('story-text-input').value.trim() : '';
      var bg   = fd.storyBg;
      var photoInput = q('story-photo-input');
      var file = photoInput && photoInput.files && photoInput.files[0];

      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        var storyData = {
          authorUid:       user.uid,
          authorPseudo:    profile ? profile.pseudo : '?',
          authorPhoto:     profile ? profile.photoUrl : null,
          authorCertified: profile ? profile.certified : false,
          text:            text || null,
          bg:              bg,
          imageUrl:        null,
          viewCount:       0,
          seenBy:          {},
          createdAt:       firebase.firestore.FieldValue.serverTimestamp()
        };

        var doSave = function() {
          return SIS.db.collection('stories').add(storyData).then(function() {
            hideOverlay('story-composer-overlay');
            SIS.toast.success('Story publiée !');
            loadStories();
          });
        };

        if (file) {
          return SIS.image.processAndUpload(file, { type: 'story' })
            .then(function(result) {
              storyData.imageUrl = result.publicId;
              return doSave();
            });
        }
        if (!text) { SIS.toast.warning('Ajoute du texte ou une photo'); return; }
        return doSave();
      }).catch(function(){ SIS.toast.error('Erreur publication story'); });
    }

    /* ── THEME ICON ── */
    function updateThemeIcon() {
      var icon = q('theme-icon');
      if (!icon) return;
      if (SIS.theme.get() === 'light') {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
      } else {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      }
    }

    /* ── INIT THREAD BLOCKS ── */
    function initThreadBlock() {
      var blocks = q('thread-blocks');
      if (!blocks) return;
      var block = document.createElement('div');
      block.className = 'thread-block-composer';
      block.innerHTML =
        '<div class="thread-block-num-label">Bloc 1</div>' +
        '<textarea class="thread-block-textarea" placeholder="Bloc 1…" maxlength="500" rows="3"></textarea>';
      block.querySelector('textarea').addEventListener('input', checkPublishReady);
      blocks.appendChild(block);
    }

    /* ── LANCER ── */
    bindEvents();
    initThreadBlock();
    switchComposerType('confession');
    updateThemeIcon();
    loadPosts(true);
    loadStories();
    initInfiniteScroll();
    SIS.injectBottomNav('feed'); /* nav en premier */
  }

  /* ══════════════════════════════════════════════════════════
     MODULES PAGES STUBS (chat, profil, notifs, decouvrir)
  ══════════════════════════════════════════════════════════ */
  var ChatModule    = { init: function () { SIS.init({ page: 'chat', requireAuth: false, onReady: initChat, onGuest: function(){ initChat(null); } }); } };
  var ProfilModule  = { init: function () { SIS.init({ page: 'profil',    requireAuth: true,  onReady: initProfil }); } };
  var NotifsModule  = { init: function () { SIS.init({ page: 'notifs',    requireAuth: true,  onReady: initNotifs }); } };
  var DiscoverModule= { init: function () { SIS.init({ page: 'decouvrir', requireAuth: false, onReady: initDiscover }); } };

  /* ══════════════════════════════════════════════════════════
     MODULE CHAT
  ══════════════════════════════════════════════════════════ */
  function initChat(user) {
    var cd = {
      currentView:   'home',   /* home | room | mystere-room */
      currentTab:    'salons',
      currentCat:    '',
      currentRoom:   null,     /* { id, type, name, isCanal, slowMode, pwd } */
      unsubMessages: null,
      unsubMystere:  null,
      replyTo:       null,     /* { id, pseudo, text } */
      slowCooldown:  false,
      slowTimer:     null,
      mystereMatchId:null,
      mystereQueueId:null,
      searchTimer:   null,
      searchSeconds: 0,
      anonPollAnon:  false,
      TENOR_KEY:     '', /* → Clé Tenor Google API */
      ADMIN_UID:     'gbaguidiexauce@gmail.com'
    };

    function q(id) { return document.getElementById(id); }
    function qsa(sel, ctx) { return Array.from((ctx||document).querySelectorAll(sel)); }
    function showOverlay(id)  { var e=q(id); if(e) e.style.display='flex'; }
    function hideOverlay(id)  { var e=q(id); if(e) e.style.display='none'; }

    /* ── NAVIGATION ENTRE VUES ── */
    function showView(name) {
      var views = ['chat-home','chat-room','chat-mystere-room'];
      views.forEach(function(v) {
        var el = q(v);
        if (!el) return;
        if (v === name) {
          el.classList.remove('slide-back');
          el.classList.add('active');
        } else if (el.classList.contains('active')) {
          el.classList.add('slide-back');
          el.classList.remove('active');
          setTimeout(function(){ el.classList.remove('slide-back'); }, 350);
        }
      });
      cd.currentView = name;
    }

    function goBack() {
      if (cd.unsubMessages) { cd.unsubMessages(); cd.unsubMessages = null; }
      /* BUG-11 fix: nettoyer slow mode timer */
      if (cd.slowTimer) { clearInterval(cd.slowTimer); cd.slowTimer = null; }
      cd.slowCooldown = false;
      var inp = q('chat-msg-input'); if(inp) inp.disabled = false;
      var sendBtn = q('btn-send-msg'); if(sendBtn) sendBtn.disabled = false;
      var bar = q('slow-cooldown'); if(bar) bar.style.display = 'none';
      cd.currentRoom = null;
      cd.replyTo = null;
      resetReplyUI();
      showView('chat-home');
    }

    /* ── TABS ── */
    function switchTab(tab) {
      cd.currentTab = tab;
      qsa('.tab-item', q('chat-main-tabs')).forEach(function(t){
        t.classList.toggle('active', t.getAttribute('data-tab') === tab);
      });
      qsa('.chat-tab-content').forEach(function(c){
        c.classList.toggle('active', c.id === 'tab-' + tab);
      });
      if (tab === 'salons')  loadSalons();
      if (tab === 'dms')     loadDMs();
      if (tab === 'mystere') initMystereTab();
      if (tab === 'canaux')  loadCanaux();
    }

    /* ── CHARGER SALONS ── */
    function loadSalons() {
      var list = q('salons-list');
      if (!list) return;
      list.innerHTML = '<div class="salon-skeleton"><div class="skeleton" style="width:42px;height:42px;border-radius:12px"></div><div style="flex:1;display:flex;flex-direction:column;gap:5px"><div class="skeleton" style="height:13px;width:55%"></div><div class="skeleton" style="height:11px;width:40%"></div></div></div>'.repeat(3);

      var query = SIS.db.collection('salons').where('hidden','==',false).orderBy('onlineCount','desc').limit(30);
      if (cd.currentCat) query = query.where('category','==',cd.currentCat);

      query.get().then(function(snap) {
        list.innerHTML = '';
        if (snap.empty) {
          list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">Aucun salon · Crée-en un !</div>';
          return;
        }
        snap.forEach(function(doc) {
          list.appendChild(renderSalonItem(doc.id, doc.data()));
        });
        /* SIS Officiel en premier */
        createSISOfficial(list);
      }).catch(function(e){ console.warn('Salons err',e); });
    }

    function createSISOfficial(list) {
      /* Canal officiel SIS (toujours présent) */
      var existing = list.querySelector('[data-salon-id="sis-officiel"]');
      if (existing) return;
      var item = document.createElement('div');
      item.className = 'salon-item';
      item.setAttribute('data-salon-id','sis-officiel');
      item.style.order = '-1';
      item.innerHTML =
        '<div class="salon-av" style="background:var(--grad);color:#fff;font-size:18px">📢</div>' +
        '<div class="salon-info">' +
          '<div class="salon-name">SIS Officiel <span class="salon-badge canal">Canal</span></div>' +
          '<div class="salon-meta">Annonces et nouveautés SIS</div>' +
        '</div>' +
        '<div class="salon-online"><span class="live-dot"></span></div>';
      item.addEventListener('click', function(){ openRoom('sis-officiel',{ name:'SIS Officiel', type:'canal', category:'general', slowMode:0, isCanal:true, isOfficial:true }); });
      list.insertBefore(item, list.firstChild);
    }

    function renderSalonItem(id, d) {
      var item = document.createElement('div');
      item.className = 'salon-item';
      item.setAttribute('data-salon-id', id);

      var catEmojis = { general:'💬',gaming:'🎮',tech:'💻',musique:'🎵',sport:'⚽',education:'📚',manga:'📺',art:'🎨' };
      var emoji = catEmojis[d.category] || '💬';

      var avHtml = d.photoUrl
        ? '<div class="salon-av"><img src="' + SIS.cloudinary.url(d.photoUrl,'thumb') + '" loading="lazy"></div>'
        : '<div class="salon-av">' + emoji + '</div>';

      var badgeType = d.type || 'public';
      var badgeLabel = { public:'Public', private:'Privé', canal:'Canal' };

      item.innerHTML =
        avHtml +
        '<div class="salon-info">' +
          '<div class="salon-name">' + SIS.utils.escHtml(d.name||'Salon') +
            ' <span class="salon-badge ' + badgeType + '">' + (badgeLabel[badgeType]||'Public') + '</span>' +
          '</div>' +
          '<div class="salon-meta">' + SIS.utils.escHtml(d.description||'') + '</div>' +
        '</div>' +
        '<div class="salon-online"><span class="live-dot"></span>' + (d.onlineCount||0) + '</div>';

      item.addEventListener('click', function(){ openRoom(id, d); });
      return item;
    }

    /* ── CHARGER DMs ── */
    function loadDMs() {
      if (!user) return;
      SIS.db.collection('dms')
        .where('participants','array-contains', user.uid)
        .orderBy('lastMsgAt','desc')
        .limit(30)
        .get()
        .then(function(snap) {
          var list = q('dms-list');
          if (!list) return;

          if (snap.empty) {
            list.innerHTML = '<div class="dms-empty"><div style="font-size:40px;margin-bottom:10px">💬</div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:15px;margin-bottom:6px">Aucun message privé</div><div style="font-size:13px;color:var(--text2)">Clique sur le profil d\'un user pour démarrer.</div></div>';
            return;
          }

          list.innerHTML = '';
          snap.forEach(function(doc) {
            var d = doc.data();
            var otherUid = (d.participants||[]).find(function(uid){ return uid !== user.uid; });
            if (!otherUid) return;

            SIS.authHelper.getProfile(otherUid).then(function(profile) {
              var item = document.createElement('div');
              item.className = 'dm-item';
              item.innerHTML =
                SIS.renderAvatar({ pseudo: profile?profile.pseudo:'?', photoUrl: profile?profile.photoUrl:null, certified: profile?profile.certified:false, size:'sm', gradient: SIS.utils.pseudoToGradient(profile?profile.pseudo||'':'') }) +
                '<div class="dm-info">' +
                  '<div class="dm-pseudo">' + SIS.utils.escHtml(profile?profile.pseudo||'?':'?') + '</div>' +
                  '<div class="dm-last-msg">' + SIS.utils.escHtml(SIS.utils.truncate(d.lastMsg||'',40)) + '</div>' +
                '</div>' +
                '<div class="dm-meta">' +
                  '<div class="dm-time">' + SIS.utils.timeAgo(d.lastMsgAt) + '</div>' +
                  (d.unread && d.unread[user.uid] ? '<div class="dm-unread">' + (d.unread[user.uid]||0) + '</div>' : '') +
                '</div>';
              item.addEventListener('click', function(){
                openRoom(doc.id, { name: profile?profile.pseudo:'?', type:'dm', otherUid: otherUid });
              });
              SIS.bindAvatarClicks(item);
              list.appendChild(item);
            });
          });
        });
    }

    /* ── CHARGER CANAUX ── */
    function loadCanaux() {
      SIS.db.collection('salons').where('type','==','canal').where('hidden','==',false)
        .orderBy('subscriberCount','desc').limit(20).get()
        .then(function(snap) {
          var list = q('canaux-list');
          if (!list) return;
          list.innerHTML = '';
          snap.forEach(function(doc) {
            var d = doc.data();
            var item = document.createElement('div');
            item.className = 'canal-item';
            var isSub = user && d.subscribers && d.subscribers[user.uid];
            item.innerHTML =
              '<div class="canal-av">📢</div>' +
              '<div class="canal-info">' +
                '<div class="canal-name">' + SIS.utils.escHtml(d.name||'Canal') + '</div>' +
                '<div class="canal-desc">' + SIS.utils.escHtml(d.description||'') + '</div>' +
              '</div>' +
              '<div class="canal-stats">' +
                '<span class="canal-sub-count">' + SIS.utils.formatCount(d.subscriberCount||0) + '</span>' +
                '<button class="btn-subscribe' + (isSub?' subscribed':'') + '" data-id="' + doc.id + '">' + (isSub?'Suivi ✓':'Suivre') + '</button>' +
              '</div>';
            item.querySelector('.btn-subscribe').addEventListener('click', function(e){
              e.stopPropagation();
              toggleSubscribe(doc.id, d, this);
            });
            item.addEventListener('click', function(){ openRoom(doc.id, d); });
            list.appendChild(item);
          });
        });
    }

    function toggleSubscribe(salonId, d, btn) {
      if (!user) { window.location.href='auth.html'; return; }
      var isSub = btn.classList.contains('subscribed');
      var update = {};
      update['subscribers.' + user.uid] = isSub ? firebase.firestore.FieldValue['delete']() : true;
      update.subscriberCount = firebase.firestore.FieldValue.increment(isSub ? -1 : 1);
      SIS.db.collection('salons').doc(salonId).update(update)
        .then(function(){
          btn.classList.toggle('subscribed', !isSub);
          btn.textContent = !isSub ? 'Suivi ✓' : 'Suivre';
          SIS.toast.success(!isSub ? 'Canal suivi !' : 'Canal retiré');
        });
    }

    /* ── OUVRIR SALON / DM ── */
    function openRoom(roomId, data) {
      /* Salon privé avec mot de passe */
      if (data.type === 'private' && data.pwd) {
        if (!user || !data.members || !data.members[user.uid]) {
          showSalonPwdSheet(roomId, data);
          return;
        }
      }

      cd.currentRoom = Object.assign({ id: roomId }, data);

      /* Mettre à jour le header */
      var catEmojis = { general:'💬',gaming:'🎮',tech:'💻',musique:'🎵',sport:'⚽',education:'📚',manga:'📺',art:'🎨' };
      var roomAvEl = q('room-av');
      if (roomAvEl) {
        if (data.photoUrl) {
          roomAvEl.innerHTML = '<img src="' + SIS.cloudinary.url(data.photoUrl,'thumb') + '" style="width:100%;height:100%;object-fit:cover">';
        } else if (data.type === 'dm') {
          roomAvEl.innerHTML = SIS.renderAvatar({ pseudo: data.name||'?', size:'xs', gradient: SIS.utils.pseudoToGradient(data.name||'') });
        } else {
          roomAvEl.textContent = catEmojis[data.category] || '💬';
        }
      }

      var nameEl = q('room-name');
      if (nameEl) nameEl.textContent = data.name || 'Salon';

      var metaEl = q('room-meta');
      if (metaEl) {
        metaEl.innerHTML = '<span class="live-dot"></span>' +
          (data.type === 'dm' ? 'En ligne' : (data.onlineCount||0) + ' en ligne');
      }

      /* Slow mode */
      var slowBar = q('slow-mode-bar');
      if (slowBar) {
        if (data.slowMode && data.slowMode > 0) {
          slowBar.style.display = 'flex';
          var lbl = q('slow-mode-label');
          if (lbl) lbl.textContent = data.slowMode + 's';
        } else {
          slowBar.style.display = 'none';
        }
      }

      /* Message épinglé */
      loadPinnedMsg(roomId);

      showView('chat-room');
      loadMessages(roomId, data);

      /* Admin check - via Firestore pour éviter le hardcode pur */
      if (user && (user.email === 'gbaguidiexauce@gmail.com' || 
          (window._sisAdminVerified && window._sisAdminVerified === user.uid))) {
        var adminPanel = document.createElement('button');
        adminPanel.className = 'topbar-btn';
        adminPanel.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
        adminPanel.addEventListener('click', openAdminPanel);
        var actions = q('room-header').querySelector('.room-header-actions');
        if (actions) actions.insertBefore(adminPanel, actions.firstChild);
      }
    }

    /* ── CHARGER MESSAGES ── */
    function loadMessages(roomId, roomData) {
      if (cd.unsubMessages) { cd.unsubMessages(); cd.unsubMessages = null; }

      var msgList = q('messages-list');
      if (!msgList) return;
      msgList.innerHTML = '<div class="msgs-skeleton"><div class="skeleton" style="height:40px;width:65%;border-radius:4px 12px 12px 12px;margin-bottom:8px"></div><div class="skeleton" style="height:40px;width:55%;border-radius:12px 4px 12px 12px;margin-left:auto;margin-bottom:8px"></div></div>';

      var collPath = roomData.type === 'dm'
        ? 'dms/' + roomId + '/messages'
        : 'salons/' + roomId + '/messages';

      cd.unsubMessages = SIS.db.collection(collPath)
        .orderBy('createdAt', 'asc')
        .limitToLast(50)
        .onSnapshot(function(snap) {
          msgList.innerHTML = '';

          var lastDate = null;
          snap.forEach(function(doc) {
            var d = doc.data();

            /* Séparateur de date */
            var msgDate = d.createdAt ? d.createdAt.toDate().toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}) : null;
            if (msgDate && msgDate !== lastDate) {
              var sep = document.createElement('div');
              sep.className = 'msg-date-sep';
              sep.textContent = msgDate;
              msgList.appendChild(sep);
              lastDate = msgDate;
            }

            var isMe = user && d.authorUid === user.uid;
            var msgEl = renderMessage(doc.id, d, isMe, roomData);
            msgList.appendChild(msgEl);
          });

          scrollToBottom(msgList);

          /* Déchiffrer les messages DM */
          if (roomData.type === 'dm' && user) {
            var secret = SIS.crypto.roomSecret(user.uid, roomData.otherUid || '');
            snap.forEach(function(doc) {
              var d = doc.data();
              if (d.encrypted && d.ciphertext) {
                SIS.crypto.decrypt(d.ciphertext, secret).then(function(plain) {
                  var el = msgList.querySelector('[data-msg-id="' + doc.id + '"] .msg-text');
                  if (el) el.textContent = plain;
                });
              }
            });
          }
        }, function(e){ console.warn('Messages err',e); });
    }

    function renderMessage(id, d, isMe, roomData) {
      var item = document.createElement('div');
      item.className = 'msg-item' + (isMe ? ' me' : ' them');
      item.setAttribute('data-msg-id', id);

      var avatarHtml = !isMe
        ? SIS.renderAvatar({
            pseudo:    d.pseudo || '?',
            photoUrl:  d.photoUrl || null,
            certified: d.certified || false,
            size:      'xs',
            gradient:  SIS.utils.pseudoToGradient(d.pseudo||''),
            onClick:   d.pseudo && d.pseudo !== 'Anonyme' ? function(pseudo){ SIS.profilePopup.show(pseudo); } : null
          })
        : '';

      /* Reply preview */
      var replyHtml = '';
      if (d.replyTo) {
        replyHtml = '<div class="msg-reply-preview"><div class="msg-reply-name">' +
          SIS.utils.escHtml(d.replyTo.pseudo||'') + '</div>' +
          '<div>' + SIS.utils.escHtml(SIS.utils.truncate(d.replyTo.text||'',60)) + '</div></div>';
      }

      /* Contenu */
      var content = '';
      if (d.imageUrl) {
        content = '<img class="msg-image" src="' + SIS.cloudinary.url(d.imageUrl,'feed') + '" loading="lazy" alt="Image">';
      } else if (d.gifUrl) {
        content = '<img class="msg-gif" src="' + SIS.utils.escHtml(d.gifUrl) + '" loading="lazy" alt="GIF">';
      } else if (d.poll) {
        content = renderMsgPoll(d.poll, id, isMe);
      } else if (d.encrypted) {
        content = '<span class="msg-text">🔒 Chiffrement…</span>';
      } else {
        content = '<span class="msg-text">' + SIS.utils.parseText(d.text||'') + '</span>';
      }

      /* Réactions */
      var reactHtml = '';
      if (d.reactions && Object.keys(d.reactions).length > 0) {
        reactHtml = '<div class="msg-reactions">';
        Object.entries(d.reactions).forEach(function(entry) {
          reactHtml += '<div class="msg-react-pill" data-msg="'+id+'" data-emoji="'+entry[0]+'">' +
            entry[0] + (entry[1]>1?' '+entry[1]:'') + '</div>';
        });
        reactHtml += '</div>';
      }

      var senderHtml = !isMe && roomData.type !== 'dm'
        ? '<div class="msg-sender">' +
            (d.country ? '<span class="msg-country">' + d.country + '</span>' : '') +
            SIS.utils.escHtml(d.pseudo||'Anonyme') +
            (d.certified ? ' <svg width="11" height="11" viewBox="0 0 24 24"><defs><linearGradient id="mcg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5B8EF4"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#mcg)"/></svg>' : '') +
          '</div>'
        : '';

      var time = d.createdAt ? d.createdAt.toDate().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '';
      var metaHtml = '<div class="msg-meta">' + time + (isMe ? ' ✓✓' : '') + '</div>';

      var bubble = '<div class="msg-bubble">' + senderHtml + replyHtml + content + metaHtml + '</div>';

      item.innerHTML = avatarHtml + bubble + reactHtml;

      /* Long press pour context menu */
      var pressTimer;
      item.addEventListener('touchstart', function(){ pressTimer = setTimeout(function(){ openMsgContext(id, d, isMe); }, 500); }, { passive:true });
      item.addEventListener('touchend', function(){ clearTimeout(pressTimer); }, { passive:true });
      item.addEventListener('contextmenu', function(e){ e.preventDefault(); openMsgContext(id, d, isMe); });

      SIS.bindAvatarClicks(item);
      return item;
    }

    function renderMsgPoll(poll, msgId, isMe) {
      var total = (poll.options||[]).reduce(function(s,o){ return s+(o.votes||0); },0);
      var optsHtml = (poll.options||[]).map(function(opt,i) {
        var pct = total>0 ? Math.round((opt.votes||0)/total*100) : 0;
        return '<div class="msg-poll-opt" data-msg-poll="'+msgId+'" data-idx="'+i+'">' +
          '<div class="msg-poll-bar" style="width:'+pct+'%"></div>' +
          '<div class="msg-poll-row"><span style="position:relative">'+SIS.utils.escHtml(opt.text||'')+'</span>' +
          '<span class="msg-poll-pct">'+pct+'%</span></div></div>';
      }).join('');
      return '<div class="msg-poll"><div class="msg-poll-question">'+SIS.utils.escHtml(poll.question||'')+'</div>'+optsHtml+'</div>';
    }

    /* ── ENVOYER MESSAGE ── */
    function sendMessage(text, extra) {
      if (!text && !extra) return;
      if (!user) { window.location.href='auth.html'; return; }
      if (cd.slowCooldown) { SIS.toast.warning('Slow mode actif'); return; }
      if (!SIS.security.rateLimit('chat_msg', 15)) { SIS.toast.warning('Trop vite !'); return; }

      var room = cd.currentRoom;
      if (!room) return;

      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        var collPath = room.type === 'dm' ? 'dms/'+room.id+'/messages' : 'salons/'+room.id+'/messages';

        var msgData = {
          authorUid:  user.uid,
          pseudo:     profile ? profile.pseudo : '?',
          photoUrl:   profile ? profile.photoUrl : null,
          certified:  profile ? profile.certified : false,
          country:    null,
          createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
          reactions:  {}
        };

        if (cd.replyTo) {
          msgData.replyTo = { id: cd.replyTo.id, pseudo: cd.replyTo.pseudo, text: cd.replyTo.text };
        }

        /* Chiffrement AES pour DMs - texte chiffré, médias flaggués */
        var textPromise;
        if (room.type === 'dm' && text) {
          var secret = SIS.crypto.roomSecret(user.uid, room.otherUid || '');
          textPromise = SIS.crypto.encrypt(text, secret).then(function(cipher) {
            msgData.encrypted = true;
            msgData.ciphertext = cipher;
            return msgData;
          });
        } else {
          msgData.text = text || null;
          if (extra) Object.assign(msgData, extra);
          textPromise = Promise.resolve(msgData);
        }

        /* Récupérer pays via RTDB presence */
        textPromise.then(function(data) {
          return SIS.db.collection(collPath).add(data);
        }).then(function() {
          /* Mettre à jour last message salon */
          if (room.type !== 'dm') {
            SIS.db.collection('salons').doc(room.id).update({
              lastMsg:   text ? SIS.utils.truncate(text, 60) : '📎',
              lastMsgAt: firebase.firestore.FieldValue.serverTimestamp(),
              onlineCount: firebase.firestore.FieldValue.increment(0)
            }).catch(function(){});
          } else {
            var dmUpdate = {
              lastMsg:   text ? SIS.utils.truncate(text,60) : '📎',
              lastMsgAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            dmUpdate['unread.' + room.otherUid] = firebase.firestore.FieldValue.increment(1);
            SIS.db.collection('dms').doc(room.id).update(dmUpdate).catch(function(){});

            /* Notif DM */
            SIS.notifs.push(room.otherUid, SIS.notifs.TYPES.COMMENT, {
              fromPseudo: profile ? profile.pseudo : null,
              type: 'dm'
            });
          }

          /* Slow mode */
          if (room.slowMode && room.slowMode > 0) startSlowCooldown(room.slowMode);

          resetReplyUI();
        }).catch(function(e){ console.warn('Send msg err',e); SIS.toast.error('Erreur envoi'); });
      });
    }

    /* ── UPLOAD IMAGE CHAT ── */
    function sendImage(file) {
      if (!file) return;
      SIS.image.processAndUpload(file, { type: 'post' })
        .then(function(result) {
          sendMessage(null, { imageUrl: result.publicId });
        })
        .catch(function(){ SIS.toast.error('Erreur upload'); });
    }

    /* ── ENVOYER GIF ── */
    function sendGif(gifUrl) {
      hideOverlay('gif-overlay');
      sendMessage(null, { gifUrl: gifUrl });
    }

    /* ── ENVOYER SONDAGE CHAT ── */
    function sendPollChat() {
      var question = q('poll-chat-question').value.trim();
      var opts = qsa('.poll-chat-opt').map(function(i){ return i.value.trim(); }).filter(Boolean);
      if (!question || opts.length < 2) { SIS.toast.error('Question et au moins 2 options requises'); return; }

      var pollData = {
        question: question,
        options:  opts.map(function(o){ return { text:o, votes:0 }; }),
        anonymous: cd.anonPollAnon
      };

      sendMessage(null, { poll: pollData });
      hideOverlay('poll-chat-overlay');
      q('poll-chat-question').value = '';
      qsa('.poll-chat-opt').forEach(function(i){ i.value=''; });
    }

    /* ── RÉACTIONS MESSAGE ── */
    function reactToMessage(msgId, emoji) {
      if (!user || !cd.currentRoom) return;
      var room = cd.currentRoom;
      var collPath = room.type === 'dm' ? 'dms/'+room.id+'/messages' : 'salons/'+room.id+'/messages';
      var update = {};
      update['reactions.' + emoji] = firebase.firestore.FieldValue.increment(1);
      SIS.db.collection(collPath).doc(msgId).update(update).catch(function(){});
    }

    /* ── SLOW MODE ── */
    function startSlowCooldown(seconds) {
      cd.slowCooldown = true;
      var bar = q('slow-cooldown');
      var input = q('chat-msg-input');
      var sendBtn = q('btn-send-msg');
      if (bar) bar.style.display = 'flex';
      if (input) input.disabled = true;
      if (sendBtn) sendBtn.disabled = true;

      var remaining = seconds;
      var cdown = q('slow-countdown');
      if (cdown) cdown.textContent = remaining;

      cd.slowTimer = setInterval(function() {
        remaining--;
        if (cdown) cdown.textContent = remaining;
        if (remaining <= 0) {
          clearInterval(cd.slowTimer);
          cd.slowCooldown = false;
          if (bar) bar.style.display = 'none';
          if (input) input.disabled = false;
          if (sendBtn) sendBtn.disabled = false;
        }
      }, 1000);
    }

    /* ── REPLY ── */
    function setReply(msgId, pseudo, text) {
      cd.replyTo = { id: msgId, pseudo: pseudo, text: text };
      var prev = q('reply-preview');
      if (prev) prev.style.display = 'flex';
      var nameEl = q('reply-preview-name');
      var textEl = q('reply-preview-text');
      if (nameEl) nameEl.textContent = pseudo;
      if (textEl) textEl.textContent = SIS.utils.truncate(text, 60);
      var input = q('chat-msg-input');
      if (input) input.focus();
    }

    function resetReplyUI() {
      cd.replyTo = null;
      var prev = q('reply-preview');
      if (prev) prev.style.display = 'none';
    }

    /* ── MESSAGE PINNED ── */
    function loadPinnedMsg(roomId) {
      SIS.db.collection('salons').doc(roomId).get().then(function(doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var bar = q('pinned-msg');
        var txt = q('pinned-msg-text');
        if (d.pinnedMsg && bar && txt) {
          bar.style.display = 'flex';
          txt.textContent = SIS.utils.truncate(d.pinnedMsg, 60);
        }
      });
    }

    /* ── CONTEXTE MESSAGE (long press) ── */
    function openMsgContext(msgId, d, isOwn) {
      var list = q('msg-context-list');
      if (!list) return;
      list.innerHTML = '';

      var opts = [
        { icon:'↩', label:'Répondre', action:'reply' },
        { icon:'📋', label:'Copier', action:'copy' },
        { icon:'❤️', label:'Réagir', action:'react' }
      ];

      if (isOwn) opts.push({ icon:'🗑', label:'Supprimer', action:'delete', danger:true });
      else opts.push({ icon:'🚩', label:'Signaler', action:'report', danger:true });

      /* Admin: épingler */
      if (user && user.email === 'gbaguidiexauce@gmail.com') {
        opts.push({ icon:'📌', label:'Épingler', action:'pin' });
      }

      opts.forEach(function(opt) {
        var item = document.createElement('div');
        item.className = 'post-option-item' + (opt.danger?' danger':'');
        item.innerHTML = '<span style="font-size:16px">' + opt.icon + '</span><span>' + opt.label + '</span>';
        item.addEventListener('click', function() {
          hideOverlay('msg-context-overlay');
          if (opt.action === 'reply') setReply(msgId, d.pseudo||'?', d.text||'');
          else if (opt.action === 'copy') {
            SIS.utils.copyToClipboard(d.text||'').then(function(){ SIS.toast.success(SIS.i18n.t('copy_success')); });
          }
          else if (opt.action === 'react') {
            showMsgReactPicker(msgId);
          }
          else if (opt.action === 'delete') {
            if (!cd.currentRoom) return;
            var collPath = cd.currentRoom.type==='dm' ? 'dms/'+cd.currentRoom.id+'/messages' : 'salons/'+cd.currentRoom.id+'/messages';
            SIS.db.collection(collPath).doc(msgId).update({ text:'[Message supprimé]', deleted:true })
              .then(function(){ SIS.toast.success('Message supprimé'); });
          }
          else if (opt.action === 'report') {
            SIS.security.report(d.authorUid||'', msgId, 'messages', 'Contenu inapproprié')
              .then(function(){ SIS.toast.success(SIS.i18n.t('report_sent')); });
          }
          else if (opt.action === 'pin' && cd.currentRoom) {
            SIS.db.collection('salons').doc(cd.currentRoom.id).update({ pinnedMsg: d.text||'' })
              .then(function(){
                var txt = q('pinned-msg-text');
                var bar = q('pinned-msg');
                if (txt) txt.textContent = SIS.utils.truncate(d.text||'',60);
                if (bar) bar.style.display='flex';
                SIS.toast.success('Message épinglé !');
              });
          }
        });
        list.appendChild(item);
      });

      var cancel = document.createElement('div');
      cancel.className = 'post-option-item';
      cancel.innerHTML = '<span style="color:var(--muted)">Annuler</span>';
      cancel.addEventListener('click', function(){ hideOverlay('msg-context-overlay'); });
      list.appendChild(cancel);

      showOverlay('msg-context-overlay');
    }

    function showMsgReactPicker(msgId) {
      var picker = document.createElement('div');
      picker.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--border2);border-radius:999px;padding:8px 12px;display:flex;gap:10px;z-index:800;box-shadow:var(--shadow-md);animation:scaleIn 0.15s ease both';
      picker.innerHTML = ['❤️','😂','🔥','👏','😮','😢'].map(function(e){
        return '<span style="font-size:22px;cursor:pointer" data-e="'+e+'">' + e + '</span>';
      }).join('');
      picker.addEventListener('click', function(ev) {
        var span = ev.target.closest('[data-e]');
        if (span) {
          reactToMessage(msgId, span.getAttribute('data-e'));
          document.body.removeChild(picker);
        }
      });
      document.body.appendChild(picker);
      setTimeout(function(){
        var p = picker;
        if (p && p.parentNode) p.parentNode.removeChild(p);
      }, 3000);
    }

    /* ── CRÉER SALON ── */
    function createSalon() {
      if (!user) { window.location.href='auth.html'; return; }
      var name = q('salon-name').value.trim();
      if (!name) { SIS.toast.error('Nomme ton salon'); return; }
      if (!SIS.security.rateLimit('create_salon', 2)) { SIS.toast.warning('Attends avant de créer un autre salon'); return; }

      var typeEl = document.querySelector('.salon-type-opt.active');
      var salonType = typeEl ? typeEl.getAttribute('data-type') : 'public';
      var pwd = salonType === 'private' ? (q('salon-pwd').value.trim() || null) : null;
      var photoInput = q('salon-photo-input');

      var salonData = {
        name:           name,
        description:    q('salon-desc').value.trim() || '',
        category:       q('salon-cat').value || 'general',
        type:           salonType,
        pwd:            pwd,
        photoUrl:       null,
        creatorUid:     user.uid,
        onlineCount:    1,
        subscriberCount:0,
        members:        {},
        subscribers:    {},
        hidden:         false,
        slowMode:       0,
        createdAt:      firebase.firestore.FieldValue.serverTimestamp()
      };
      salonData.members[user.uid] = 'admin';

      var doCreate = function() {
        SIS.db.collection('salons').add(salonData).then(function(ref) {
          hideOverlay('create-salon-overlay');
          SIS.toast.success('Salon créé !');
          openRoom(ref.id, salonData);
          loadSalons();
        }).catch(function(){ SIS.toast.error('Erreur création'); });
      };

      var file = photoInput && photoInput.files && photoInput.files[0];
      if (file) {
        SIS.image.processAndUpload(file, { type: 'avatar' })
          .then(function(result) { salonData.photoUrl = result.publicId; doCreate(); })
          .catch(doCreate);
      } else {
        doCreate();
      }
    }

    /* ── PASSWORD SALON ── */
    function showSalonPwdSheet(roomId, data) {
      q('salon-pwd-overlay') && (q('salon-pwd-overlay').style.display='flex');
      var joinBtn = q('btn-salon-pwd-join');
      if (joinBtn) {
        joinBtn.onclick = function() {
          var entered = q('salon-pwd-input').value;
          if (entered === data.pwd) {
            hideOverlay('salon-pwd-overlay');
            /* Ajouter user aux membres */
            var update = {};
            update['members.' + user.uid] = 'member';
            SIS.db.collection('salons').doc(roomId).update(update).catch(function(){});
            openRoom(roomId, data);
          } else {
            SIS.toast.error('Mot de passe incorrect');
          }
        };
      }
    }

    /* ── CHAT MYSTÈRE ── */
    function initMystereTab() {
      /* Stats live */
      SIS.rtdb.ref('presence').orderByChild('online').equalTo(true)
        .once('value').then(function(snap) {
          var count = snap.numChildren ? snap.numChildren() : 0;
          var el = q('mystere-online');
          if (el) el.textContent = SIS.utils.formatCount(count);
        }).catch(function(){});

      /* Streak */
      if (user) {
        SIS.db.collection('users').doc(user.uid).get().then(function(doc) {
          if (!doc.exists) return;
          var streak = doc.data().mystereStreak || 0;
          if (streak > 0) {
            var bar = q('mystere-streak');
            var cnt = q('streak-count');
            if (bar) bar.style.display = 'flex';
            if (cnt) cnt.textContent = streak;
          }
        });
      }
    }

    function startMystereSearch() {
      if (!user) { window.location.href='auth.html'; return; }

      q('mystere-home').style.display = 'none';
      q('mystere-searching').style.display = 'flex';

      var seconds = 0;
      cd.searchSeconds = 0;
      var timer = setInterval(function(){
        seconds++;
        cd.searchSeconds = seconds;
        var el = q('search-timer');
        if (el) el.textContent = seconds + 's';
      }, 1000);

      /* Écrire dans la queue RTDB */
      var queueRef = SIS.rtdb.ref('mystere_queue/' + user.uid);
      queueRef.set({
        uid:       user.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        searching: true
      });

      cd.mystereQueueId = user.uid;

      /* Écouter un match */
      var matchRef = SIS.rtdb.ref('mystere_matches/' + user.uid);
      cd.unsubMystere = matchRef.on('value', function(snap) {
        var val = snap.val();
        if (val && val.matchedWith) {
          clearInterval(timer);
          matchRef.off();
          queueRef.remove();
          cd.unsubMystere = null;
          startMystereConversation(val.matchedWith, val.matchId);
        }
      });

      /* Fallback : si pas de match en 30s, créer une salle fictive */
      setTimeout(function() {
        if (q('mystere-searching') && q('mystere-searching').style.display !== 'none') {
          clearInterval(timer);
          if (cd.unsubMystere) { matchRef.off(); cd.unsubMystere = null; }
          /* Demo match pour tester l'UI */
          startMystereConversation('demo_user_' + Date.now(), 'mystere_' + user.uid + '_demo');
        }
      }, 30000);
    }

    function startMystereConversation(matchedUid, matchId) {
      cd.mystereMatchId = matchId;

      q('mystere-home').style.display = 'flex';
      q('mystere-searching').style.display = 'none';

      /* Stats match */
      var metaEl = q('mystere-match-meta');
      if (metaEl) metaEl.textContent = '🌍 En ligne · Match trouvé !';

      /* Streak bar */
      var streakBar = q('mystere-streak-bar');
      if (streakBar) {
        streakBar.style.display = 'flex';
        var compat = q('mystere-compat');
        if (compat) compat.textContent = '⚡ Compatibilité : ' + (Math.floor(Math.random()*30)+70) + '%';
      }

      showView('chat-mystere-room');

      /* Charger messages mystère */
      var msgList = q('mystere-messages-list');
      if (msgList) {
        msgList.innerHTML = '';
        /* Message de bienvenue */
        var welcome = document.createElement('div');
        welcome.className = 'msg-date-sep';
        welcome.textContent = 'Conversation anonyme chiffrée 🔒';
        msgList.appendChild(welcome);

        SIS.db.collection('mystere_chats').doc(matchId).collection('messages')
          .orderBy('createdAt','asc').limitToLast(50)
          .onSnapshot(function(snap) {
            msgList.innerHTML = '';
            msgList.appendChild(welcome);
            snap.forEach(function(doc) {
              var d = doc.data();
              var isMe = user && d.authorUid === user.uid;
              var msgEl = renderMessage(doc.id, d, isMe, { type: 'mystere' });
              msgList.appendChild(msgEl);
            });
            scrollToBottom(msgList);
          });
      }
    }

    function cancelMystereSearch() {
      if (cd.unsubMystere) {
        SIS.rtdb.ref('mystere_matches/' + user.uid).off();
        cd.unsubMystere = null;
      }
      if (cd.mystereQueueId) {
        SIS.rtdb.ref('mystere_queue/' + cd.mystereQueueId).remove();
        cd.mystereQueueId = null;
      }
      q('mystere-home').style.display = 'flex';
      q('mystere-searching').style.display = 'none';
    }

    function sendMystereMessage() {
      var input = q('mystere-msg-input');
      var text = input ? input.value.trim() : '';
      if (!text || !cd.mystereMatchId || !user) return;
      input.value = '';

      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        SIS.db.collection('mystere_chats').doc(cd.mystereMatchId)
          .collection('messages').add({
            authorUid: user.uid,
            pseudo:    '🎭 Inconnu',
            text:      text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            reactions: {}
          }).catch(function(){});
      });
    }

    /* ── INFOS SALON ── */
    function openRoomInfo() {
      if (!cd.currentRoom) return;
      var room = cd.currentRoom;
      var content = q('room-info-content');
      if (!content) return;

      content.innerHTML = '<div style="padding:14px 16px"><div class="sheet-handle" style="margin-bottom:10px"></div>' +
        '<h3 style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:17px;margin-bottom:4px">' + SIS.utils.escHtml(room.name||'') + '</h3>' +
        '<p style="font-size:13px;color:var(--text2)">' + SIS.utils.escHtml(room.description||'') + '</p></div>' +
        '<div class="room-info-section"><div class="room-info-section-title">Paramètres</div>' +
        '<div style="font-size:13px;color:var(--text2)">Type : ' + (room.type||'public') + '</div>' +
        '<div style="font-size:13px;color:var(--text2);margin-top:4px">Slow mode : ' + (room.slowMode||0) + 's</div></div>';

      /* Membres */
      if (room.type !== 'canal') {
        content.innerHTML += '<div class="room-info-section"><div class="room-info-section-title">Membres</div><div id="room-members-list"></div></div>';
        if (room.members) {
          var memberList = content.querySelector('#room-members-list');
          Object.entries(room.members).forEach(function(entry) {
            SIS.authHelper.getProfile(entry[0]).then(function(profile) {
              if (!profile || !memberList) return;
              var item = document.createElement('div');
              item.className = 'room-member-item';
              item.innerHTML =
                SIS.renderAvatar({ pseudo: profile.pseudo||'?', photoUrl: profile.photoUrl, certified: profile.certified, size:'xs', gradient: SIS.utils.pseudoToGradient(profile.pseudo||'') }) +
                '<span style="font-size:13px;color:var(--text)">' + SIS.utils.escHtml(profile.pseudo||'?') + '</span>' +
                '<span class="room-member-role ' + (entry[1]==='admin'?'role-admin':'role-mod') + '">' + entry[1] + '</span>';
              memberList.appendChild(item);
            });
          });
        }
      }

      /* Partager le lien */
      content.innerHTML += '<div class="room-info-section">' +
        '<button class="btn-primary" onclick="(function(){var l=\''+window.location.origin+'/chat.html?room='+room.id+'\';navigator.clipboard&&navigator.clipboard.writeText(l).then(function(){});})()">Copier le lien du salon</button></div>';

      showOverlay('room-info-overlay');
    }

    /* ── ADMIN PANEL ── */
    function openAdminPanel() {
      var content = q('admin-content');
      if (!content) return;

      /* Stats globales */
      Promise.all([
        SIS.db.collection('users').get(),
        SIS.db.collection('posts').get(),
        SIS.db.collection('reports').where('resolved','==',false).get(),
        SIS.db.collection('users').where('banned','==',true).get()
      ]).then(function(results) {
        content.innerHTML =
          '<div class="admin-stat-grid">' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[0].size + '</div><div class="admin-stat-lbl">Utilisateurs</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[1].size + '</div><div class="admin-stat-lbl">Messages</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[2].size + '</div><div class="admin-stat-lbl">Signalements</div></div>' +
            '<div class="admin-stat-card"><div class="admin-stat-val">' + results[3].size + '</div><div class="admin-stat-lbl">Bannis</div></div>' +
          '</div>';

        /* Annonce globale */
        content.innerHTML +=
          '<div style="margin-top:16px">' +
            '<label class="input-label">Annonce globale</label>' +
            '<textarea id="admin-annonce" class="input" rows="3" placeholder="Message pour tous les salons…"></textarea>' +
            '<button class="btn-primary" style="margin-top:8px" id="btn-send-annonce">Envoyer l\'annonce</button>' +
          '</div>';

        var btn = q('btn-send-annonce');
        if (btn) {
          btn.addEventListener('click', function() {
            var msg = q('admin-annonce').value.trim();
            if (!msg) return;
            SIS.db.collection('salons').get().then(function(snap) {
              var batch = SIS.db.batch();
              snap.forEach(function(doc) {
                var ref = SIS.db.collection('salons').doc(doc.id).collection('messages').doc();
                batch.set(ref, {
                  authorUid: user.uid, pseudo: '📢 SIS Officiel', certified: true,
                  text: msg, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                  reactions: {}, system: true
                });
              });
              return batch.commit();
            }).then(function(){ SIS.toast.success('Annonce envoyée dans tous les salons !'); });
          });
        }
      });

      showOverlay('admin-panel-overlay');
    }

    /* ── SCROLL BAS ── */
    function scrollToBottom(el) {
      if (el) setTimeout(function(){ el.scrollTop = el.scrollHeight; }, 80);
    }

    /* ── GIF SEARCH CHAT ── */
    var gifSearchChat = SIS.utils.debounce(function(query) {
      if (!query) { q('gif-results-chat').innerHTML=''; return; }
      var url = 'https://tenor.googleapis.com/v2/search?q='+encodeURIComponent(query)+'&key='+cd.TENOR_KEY+'&limit=12&media_filter=gif';
      fetch(url).then(function(r){ return r.json(); }).then(function(data) {
        var results = q('gif-results-chat');
        if (!results) return;
        results.innerHTML = '';
        (data.results||[]).forEach(function(item) {
          var gif = item.media_formats && item.media_formats.tinygif ? item.media_formats.tinygif.url : null;
          if (!gif) return;
          var el = document.createElement('div');
          el.className = 'gif-item';
          el.innerHTML = '<img src="'+gif+'" loading="lazy">';
          el.addEventListener('click', function(){ sendGif(gif); });
          results.appendChild(el);
        });
      });
    }, 500);

    /* ── BIND EVENTS ── */
    function bindEvents() {
      /* Tabs */
      qsa('.tab-item', q('chat-main-tabs')).forEach(function(tab) {
        tab.addEventListener('click', function() { switchTab(tab.getAttribute('data-tab')); });
      });

      /* Catégories salons */
      qsa('.scat').forEach(function(cat) {
        cat.addEventListener('click', function() {
          qsa('.scat').forEach(function(c){ c.classList.remove('active'); });
          cat.classList.add('active');
          cd.currentCat = cat.getAttribute('data-cat');
          loadSalons();
        });
      });

      /* Retour */
      q('btn-room-back') && q('btn-room-back').addEventListener('click', goBack);
      q('btn-mystere-back') && q('btn-mystere-back').addEventListener('click', function() {
        if (cd.unsubMessages) { cd.unsubMessages(); cd.unsubMessages=null; }
        cd.mystereMatchId = null;
        showView('chat-home');
      });

      /* Room info */
      q('btn-room-info') && q('btn-room-info').addEventListener('click', openRoomInfo);
      q('room-info-overlay') && q('room-info-overlay').addEventListener('click', function(e){ if(e.target===this) hideOverlay('room-info-overlay'); });

      /* Send message */
      var sendBtn = q('btn-send-msg');
      var msgInput = q('chat-msg-input');
      if (sendBtn) sendBtn.addEventListener('click', function() {
        var text = msgInput ? msgInput.value.trim() : '';
        if (!text) return;
        if (msgInput) msgInput.value = '';
        sendMessage(text);
      });
      if (msgInput) msgInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var text = this.value.trim();
          if (!text) return;
          this.value = '';
          sendMessage(text);
        }
      });

      /* Reply cancel */
      q('reply-cancel') && q('reply-cancel').addEventListener('click', resetReplyUI);

      /* Attach image */
      q('btn-attach') && q('btn-attach').addEventListener('click', function(){ q('chat-file-input').click(); });
      q('chat-file-input') && q('chat-file-input').addEventListener('change', function(){ sendImage(this.files&&this.files[0]); });

      /* GIF */
      q('btn-gif') && q('btn-gif').addEventListener('click', function(){ showOverlay('gif-overlay'); q('gif-search-chat').focus(); });
      q('gif-overlay') && q('gif-overlay').addEventListener('click', function(e){ if(e.target===this) hideOverlay('gif-overlay'); });
      q('gif-search-chat') && q('gif-search-chat').addEventListener('input', function(){ gifSearchChat(this.value.trim()); });

      /* Poll */
      q('btn-poll-chat') && q('btn-poll-chat').addEventListener('click', function(){ showOverlay('poll-chat-overlay'); });
      q('poll-chat-overlay') && q('poll-chat-overlay').addEventListener('click', function(e){ if(e.target===this) hideOverlay('poll-chat-overlay'); });
      q('btn-send-poll-chat') && q('btn-send-poll-chat').addEventListener('click', sendPollChat);
      q('add-poll-chat-opt') && q('add-poll-chat-opt').addEventListener('click', function() {
        var opts = qsa('.poll-chat-opt');
        if (opts.length >= 4) return;
        var inp = document.createElement('input');
        inp.type='text'; inp.className='input poll-chat-opt';
        inp.placeholder='Option '+(opts.length+1); inp.maxLength=80;
        inp.style.marginTop='8px';
        q('poll-chat-options').appendChild(inp);
      });
      q('anon-poll-box') && q('anon-poll-box').addEventListener('click', function(){
        cd.anonPollAnon = !cd.anonPollAnon;
        this.classList.toggle('checked', cd.anonPollAnon);
      });

      /* Créer salon */
      q('btn-create-salon') && q('btn-create-salon').addEventListener('click', function(){
        if (!user) { window.location.href='auth.html'; return; }
        showOverlay('create-salon-overlay');
      });
      q('create-salon-overlay') && q('create-salon-overlay').addEventListener('click', function(e){ if(e.target===this) hideOverlay('create-salon-overlay'); });
      q('btn-create-salon-confirm') && q('btn-create-salon-confirm').addEventListener('click', createSalon);

      /* Type salon */
      qsa('.salon-type-opt').forEach(function(opt) {
        opt.addEventListener('click', function() {
          qsa('.salon-type-opt').forEach(function(o){ o.classList.remove('active'); });
          opt.classList.add('active');
          var isPwd = opt.getAttribute('data-type') === 'private';
          var grp = q('salon-pwd-group');
          if (grp) grp.style.display = isPwd ? 'block' : 'none';
        });
      });

      /* Desc count */
      q('salon-desc') && q('salon-desc').addEventListener('input', function(){
        var el = q('salon-desc-count');
        if (el) el.textContent = this.value.length;
      });

      /* Salon photo */
      q('salon-photo-upload') && q('salon-photo-upload').addEventListener('click', function(){ q('salon-photo-input').click(); });
      q('salon-photo-input') && q('salon-photo-input').addEventListener('change', function(){
        var file = this.files && this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
          var prev = q('salon-photo-preview');
          if (prev) prev.innerHTML = '<img src="'+e.target.result+'">';
        };
        reader.readAsDataURL(file);
      });

      /* Password salon */
      q('btn-salon-pwd-cancel') && q('btn-salon-pwd-cancel').addEventListener('click', function(){ hideOverlay('salon-pwd-overlay'); });

      /* Mystère */
      q('btn-start-mystere') && q('btn-start-mystere').addEventListener('click', startMystereSearch);
      q('btn-cancel-mystere') && q('btn-cancel-mystere').addEventListener('click', cancelMystereSearch);
      q('btn-end-mystere') && q('btn-end-mystere').addEventListener('click', function(){
        if (cd.unsubMessages) { cd.unsubMessages(); cd.unsubMessages=null; }
        cd.mystereMatchId = null;
        showView('chat-home');
      });

      /* Send mystère */
      var mystereBtn = q('btn-send-mystere');
      var mystereInput = q('mystere-msg-input');
      if (mystereBtn) mystereBtn.addEventListener('click', sendMystereMessage);
      if (mystereInput) mystereInput.addEventListener('keydown', function(e){
        if (e.key==='Enter') { e.preventDefault(); sendMystereMessage(); }
      });

      /* Réactions mystère */
      qsa('.mreact').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (!cd.mystereMatchId) return;
          SIS.reactionStorm(btn.getAttribute('data-r'), window.innerWidth/2, window.innerHeight/2);
        });
      });

      /* Admin close */
      q('admin-close') && q('admin-close').addEventListener('click', function(){ hideOverlay('admin-panel-overlay'); });

      /* Context overlays */
      q('msg-context-overlay') && q('msg-context-overlay').addEventListener('click', function(e){ if(e.target===this) hideOverlay('msg-context-overlay'); });

      /* Délégation réactions dans messages */
      ['messages-list','mystere-messages-list'].forEach(function(listId) {
        var list = q(listId);
        if (!list) return;
        list.addEventListener('click', function(e) {
          var pill = e.target.closest('.msg-react-pill');
          if (pill) {
            reactToMessage(pill.getAttribute('data-msg'), pill.getAttribute('data-emoji'));
          }
          var pollOpt = e.target.closest('[data-msg-poll]');
          if (pollOpt) {
            /* Vote sondage chat */
            var msgId = pollOpt.getAttribute('data-msg-poll');
            var idx = parseInt(pollOpt.getAttribute('data-idx'),10);
            var voteKey = 'poll_vote_' + msgId;
            if (localStorage.getItem(voteKey)) { SIS.toast.info('Déjà voté'); return; }
            localStorage.setItem(voteKey, idx);
            if (!cd.currentRoom) return;
            var coll = cd.currentRoom.type==='dm' ? 'dms/'+cd.currentRoom.id+'/messages' : 'salons/'+cd.currentRoom.id+'/messages';
            var update = {};
            update['poll.options.'+idx+'.votes'] = firebase.firestore.FieldValue.increment(1);
            SIS.db.collection(coll).doc(msgId).update(update).catch(function(){});
          }
        });
      });

      /* URL params : ouvrir DM ou salon direct */
      var params = new URLSearchParams(window.location.search);
      var dmPseudo = params.get('dm');
      var roomId   = params.get('room');

      if (dmPseudo) {
        /* Ouvrir DM avec ce pseudo */
        SIS.db.collection('users').where('pseudo','==',dmPseudo).limit(1).get().then(function(snap) {
          if (!snap.empty) {
            var other = snap.docs[0].data();
            var otherUid = snap.docs[0].id;
            /* Trouver ou créer le DM */
            var dmId = [user.uid, otherUid].sort().join('_');
            SIS.db.collection('dms').doc(dmId).set({
              participants: [user.uid, otherUid],
              lastMsg: '', lastMsgAt: firebase.firestore.FieldValue.serverTimestamp(),
              unread: {}
            }, { merge: true }).then(function(){
              switchTab('dms');
              openRoom(dmId, { name: other.pseudo||'?', type:'dm', otherUid: otherUid });
            });
          }
        });
      } else if (roomId) {
        SIS.db.collection('salons').doc(roomId).get().then(function(doc) {
          if (doc.exists) openRoom(roomId, doc.data());
        });
      }
    }

    /* ── INIT ── */
    bindEvents();
    loadSalons();
    SIS.injectBottomNav('chat');

    /* FIX: Clavier Android */
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        var nav = document.getElementById('bnav');
        if (!nav) return;
        nav.style.display = window.visualViewport.height < window.innerHeight * 0.75 ? 'none' : 'flex';
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     MODULE PROFIL
  ══════════════════════════════════════════════════════════ */
  function initProfil(user) {
    var pd = {
      profile:         null,
      currentTab:      'posts',
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
      SIS.authHelper.getProfile(user.uid).then(function(profile) {
        if (!profile) { window.location.href='auth.html'; return; }
        pd.profile = profile;
        renderProfile(profile);
      });
    }

    function renderProfile(p) {
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

      /* Stats */
      var fEl = q('stat-followers');
      var fgEl = q('stat-following');
      var rEl = q('stat-reactions');
      var vEl = q('stat-viral');
      if (fEl) { fEl.className='pstat-v'; fEl.textContent = SIS.utils.formatCount(p.followers||0); }
      if (fgEl){ fgEl.className='pstat-v'; fgEl.textContent = SIS.utils.formatCount(p.following||0); }
      if (rEl) { rEl.className='pstat-v'; rEl.textContent = SIS.utils.formatCount(p.totalReactions||0); }
      if (vEl) {
        /* Compter posts viraux */
        SIS.db.collection('posts').where('authorUid','==',user.uid)
          .where('echoCount','>=',5).get()
          .then(function(snap){ vEl.textContent = '🔥×'+snap.size; });
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

      /* Charger posts */
      loadPostsGrid();
    }

    /* ── GRILLE POSTS ── */
    function loadPostsGrid() {
      var grid = q('profil-posts-grid');
      if (!grid) return;
      grid.innerHTML = '';

      SIS.db.collection('posts')
        .where('authorUid','==', user.uid)
        .where('identity','==','name')
        .orderBy('createdAt','desc')
        .limit(18)
        .get()
        .then(function(snap) {
          if (snap.empty) {
            grid.innerHTML = '<div style="grid-column:span 3;text-align:center;padding:30px;color:var(--muted);font-size:13px">Aucun post public</div>';
            return;
          }
          snap.forEach(function(doc) { grid.appendChild(renderGridItem(doc.id, doc.data())); });
        });
    }

    function renderGridItem(id, d) {
      var el = document.createElement('div');
      el.className = 'pgrid-item';
      el.setAttribute('data-post-id', id);

      var typeColors = { confession:'#f04f5a',csdpm:'#4ade80',whisper:'#a78bfa',battle:'#fbbf24',burn:'#f04f5a',media:'#7eb3ff',poll:'#22d3ee',thread:'#f59e0b' };
      var typeIcons  = { confession:'💬',csdpm:'🤫',whisper:'👻',battle:'⚡',burn:'🔥',media:'📸',poll:'📊',thread:'🧵' };

      if (d.type==='media' && d.mediaUrl) {
        el.innerHTML = '<img src="'+SIS.cloudinary.url(d.mediaUrl,'thumb')+'" loading="lazy">' +
          (d.echoCount>=5 ? '<span class="viral-badge">🔥</span>' : '');
      } else {
        el.style.background = typeColors[d.type] ? 'rgba('+hexToRgb(typeColors[d.type])+',0.12)' : 'var(--card2)';
        el.innerHTML =
          '<div class="pgrid-item-label">' +
            '<div style="font-size:18px;margin-bottom:3px">' + (typeIcons[d.type]||'💬') + '</div>' +
            SIS.utils.escHtml(SIS.utils.truncate(d.text||d.question||'',30)) +
          '</div>' +
          (d.echoCount>=5 ? '<span class="viral-badge">🔥</span>' : '');
      }
      return el;
    }

    function hexToRgb(hex) {
      var r = parseInt(hex.slice(1,3),16);
      var g = parseInt(hex.slice(3,5),16);
      var b = parseInt(hex.slice(5,7),16);
      return r+','+g+','+b;
    }

    /* ── POSTS VIRAUX ── */
    function loadViralPosts() {
      var grid = q('viral-posts-grid');
      if (!grid) return;
      grid.innerHTML = '';
      SIS.db.collection('posts').where('authorUid','==',user.uid)
        .where('echoCount','>=',3).orderBy('echoCount','desc').limit(9).get()
        .then(function(snap) {
          if (snap.empty) {
            grid.innerHTML = '<div style="grid-column:span 3;text-align:center;padding:30px;color:var(--muted);font-size:13px">Aucun post viral encore 🌱</div>';
            return;
          }
          snap.forEach(function(doc) { grid.appendChild(renderGridItem(doc.id, doc.data())); });
        });
    }

    /* ── MESSAGES ANONYMES REÇUS ── */
    function loadAnonMsgs() {
      /* Redirige vers voir.html */
      var list = q('anon-msgs-list');
      if (!list) return;
      list.innerHTML =
        '<div style="text-align:center;padding:20px">' +
          '<p style="font-size:13px;color:var(--text2);margin-bottom:12px">Tes messages anonymes sont sur</p>' +
          '<a href="https://sis-say-it-safely-pi.vercel.app/voir.html" ' +
             'style="display:inline-block;padding:10px 20px;background:var(--grad);color:#fff;border-radius:var(--r-sm);font-weight:700;font-size:13px;text-decoration:none">' +
            '🔒 Voir mes messages anonymes' +
          '</a>' +
        '</div>';
    }

    /* ── STATS DÉTAIL ── */
    function loadStatsDetail() {
      var cont = q('profil-stats-detail');
      if (!cont) return;

      SIS.db.collection('posts').where('authorUid','==',user.uid).get().then(function(snap) {
        var counts = { confession:0,csdpm:0,whisper:0,battle:0,burn:0,media:0,poll:0,thread:0 };
        var totalReactions = 0;
        snap.forEach(function(doc) {
          var d = doc.data();
          if (counts[d.type] !== undefined) counts[d.type]++;
          if (d.reactions) Object.values(d.reactions).forEach(function(v){ totalReactions += v||0; });
        });

        var max = Math.max.apply(null, Object.values(counts)) || 1;
        var barsHtml = Object.entries(counts).map(function(e) {
          var pct = Math.round(e[1]/max*100);
          return '<div class="stat-bar-row">' +
            '<span class="stat-bar-label">' + e[0] + '</span>' +
            '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:'+pct+'%"></div></div>' +
            '<span class="stat-bar-val">' + e[1] + '</span>' +
            '</div>';
        }).join('');

        cont.innerHTML =
          '<div class="stat-card">' +
            '<div class="stat-card-title">Types de posts</div>' + barsHtml +
          '</div>' +
          '<div class="stat-card">' +
            '<div class="stat-card-title">Total</div>' +
            '<div style="font-size:13px;color:var(--text2)">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Posts publiés</span><strong>'+snap.size+'</strong></div>' +
              '<div style="display:flex;justify-content:space-between"><span>Réactions reçues</span><strong>'+SIS.utils.formatCount(totalReactions)+'</strong></div>' +
            '</div>' +
          '</div>';
      });
    }

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

      /* Thème */
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

        var savePromise;
        if (pd.editAvatarFile) {
          var prog = q('edit-upload-progress');
          if (prog) prog.style.display = 'flex';
          savePromise = SIS.image.processAndUpload(
            pd.editAvatarFile, { type:'avatar' },
            function(pct) {
              var fill = q('edit-progress-fill');
              var lbl = q('edit-progress-label');
              if (fill) fill.style.width = pct+'%';
              if (lbl) lbl.textContent = 'Upload… '+pct+'%';
            }
          ).then(function(result) {
            updates.photoUrl = result.publicId;
            return SIS.authHelper.updateProfile(user.uid, updates);
          });
        } else {
          savePromise = SIS.authHelper.updateProfile(user.uid, updates);
        }

        savePromise.then(function() {
          hideO('edit-profil-overlay');
          pd.editAvatarFile = null;
          SIS.toast.success('Profil mis à jour !');
          loadProfile();
        }).catch(function(){ SIS.toast.error('Erreur sauvegarde'); });
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
      }).catch(function(){ SIS.toast.error('Erreur envoi'); });
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
      /* Tabs */
      qsa('.ptab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          pd.currentTab = tab.getAttribute('data-tab');
          qsa('.ptab').forEach(function(t){ t.classList.remove('active'); });
          qsa('.profil-tab-content').forEach(function(c){ c.classList.remove('active'); });
          tab.classList.add('active');
          var tc = q('tab-'+pd.currentTab);
          if (tc) tc.classList.add('active');
          if (pd.currentTab==='viral')   loadViralPosts();
          if (pd.currentTab==='anonymous') loadAnonMsgs();
          if (pd.currentTab==='stats')   loadStatsDetail();
        });
      });

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

      var query = SIS.db.collection('notifications').doc(user.uid)
        .collection('items').orderBy('createdAt','desc').limit(50);

      query.onSnapshot(function(snap) {
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
              pseudo: d.fromPseudo, size:'sm',
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
            /* Navigation */
            if (d.postId) window.location.href = 'feed.html?post='+d.postId;
            else if (d.type==='follow' && d.fromPseudo) SIS.profilePopup.show(d.fromPseudo);
            else if (d.type==='anon') window.location.href = 'https://sis-say-it-safely-pi.vercel.app/voir.html';
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

  /* ══════════════════════════════════════════════════════════
     MODULE DÉCOUVRIR
  ══════════════════════════════════════════════════════════ */
  function initDiscover(user) {
    function q(id) { return document.getElementById(id); }
    function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

    var searchDebounced = SIS.utils.debounce(function(query) {
      if (!query) {
        q('search-results').style.display = 'none';
        q('disc-content').style.display = 'block';
        return;
      }
      q('search-results').style.display = 'block';
      q('disc-content').style.display = 'none';
      performSearch(query);
    }, 350);

    function performSearch(query) {
      var list = q('search-results-list');
      if (!list) return;
      list.innerHTML = '<div class="notif-skeleton"><div class="skeleton" style="width:38px;height:38px;border-radius:50%"></div><div style="flex:1;display:flex;flex-direction:column;gap:5px"><div class="skeleton" style="height:13px;width:55%"></div></div></div>';

      /* Recherche utilisateurs (pseudo commence par query) */
      SIS.db.collection('users')
        .where('pseudo','>=', query)
        .where('pseudo','<=', query+'\uf8ff')
        .limit(5).get()
        .then(function(snap) {
          list.innerHTML = '';
          snap.forEach(function(doc) {
            var d = doc.data();
            var item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML =
              SIS.renderAvatar({ pseudo:d.pseudo||'?', photoUrl:d.photoUrl||null, certified:d.certified||false, size:'sm', gradient:SIS.utils.pseudoToGradient(d.pseudo||'') }) +
              '<div style="flex:1;min-width:0">' +
                '<div style="font-size:13px;font-weight:600;color:var(--text)">'+SIS.utils.escHtml(d.pseudo||'?')+'</div>' +
                '<div style="font-size:11px;color:var(--muted)">'+SIS.utils.formatCount(d.followers||0)+' abonnés</div>' +
              '</div>' +
              '<span class="search-result-type srt-user">User</span>';
            item.addEventListener('click', function(){ SIS.profilePopup.show(d.pseudo); });
            SIS.bindAvatarClicks(item);
            list.appendChild(item);
          });

          /* Recherche hashtags dans les posts */
          SIS.db.collection('posts').where('hidden','==',false)
            .where('hashtags','array-contains',query.toLowerCase())
            .limit(5).get()
            .then(function(psnap) {
              psnap.forEach(function(doc) {
                var d = doc.data();
                var item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML =
                  '<div style="width:38px;height:38px;border-radius:50%;background:rgba(139,92,246,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">#</div>' +
                  '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:13px;font-weight:600;color:var(--text)">'+SIS.utils.escHtml(SIS.utils.truncate(d.text||'',50))+'</div>' +
                    '<div style="font-size:11px;color:var(--muted)">'+SIS.utils.timeAgo(d.createdAt)+'</div>' +
                  '</div>' +
                  '<span class="search-result-type srt-post">Post</span>';
                item.addEventListener('click', function(){ window.location.href='feed.html?post='+doc.id; });
                list.appendChild(item);
              });

              if (list.children.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Aucun résultat pour "'+SIS.utils.escHtml(query)+'"</div>';
              }
            });
        });
    }

    function loadTrending() {
      var wrap = q('trending-tags');
      if (!wrap) return;

      /* Tags hardcodés + dynamiques */
      var staticTags = [
        { tag:'confession', count: 0 },
        { tag:'vérité',     count: 0 },
        { tag:'drama',      count: 0 },
        { tag:'bénin',      count: 0 },
        { tag:'amour',      count: 0 },
        { tag:'anonymous',  count: 0 }
      ];

      SIS.db.collection('posts').where('hidden','==',false)
        .orderBy('createdAt','desc').limit(50).get()
        .then(function(snap) {
          var tagCount = {};
          snap.forEach(function(doc) {
            var d = doc.data();
            var text = (d.text||d.question||'').toLowerCase();
            var matches = text.match(/#([a-zA-Z0-9_\u00C0-\u024F]{2,30})/g) || [];
            matches.forEach(function(m) {
              var t = m.slice(1);
              tagCount[t] = (tagCount[t]||0) + 1;
            });
          });

          /* Merger avec statiques */
          staticTags.forEach(function(st) {
            tagCount[st.tag] = (tagCount[st.tag]||0) + 100;
          });

          var sorted = Object.entries(tagCount)
            .sort(function(a,b){ return b[1]-a[1]; })
            .slice(0,12);

          wrap.innerHTML = '';
          sorted.forEach(function(entry, i) {
            var chip = document.createElement('div');
            chip.className = 'disc-tag';
            chip.style.animationDelay = (i*0.04)+'s';
            chip.innerHTML = '<span>#'+SIS.utils.escHtml(entry[0])+'</span><span class="disc-tag-count">'+SIS.utils.formatCount(entry[1])+'</span>';
            chip.addEventListener('click', function() {
              window.location.href = 'feed.html?hashtag='+encodeURIComponent(entry[0]);
            });
            wrap.appendChild(chip);
          });
        });
    }

    function loadSuggestedUsers() {
      var wrap = q('suggested-users');
      if (!wrap) return;

      var query = SIS.db.collection('users').orderBy('followers','desc').limit(10);

      query.get().then(function(snap) {
        wrap.innerHTML = '';
        snap.forEach(function(doc) {
          var d = doc.data();
          if (user && doc.id === user.uid) return; /* Pas soi-même */

          var isFollowing = false; /* On ne vérifie pas pour l'instant */
          var item = document.createElement('div');
          item.className = 'disc-user-item';

          var certSvg = d.certified
            ? '<svg width="12" height="12" viewBox="0 0 24 24"><defs><linearGradient id="dcg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5B8EF4"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="url(#dcg)"/></svg>'
            : '';

          item.innerHTML =
            SIS.renderAvatar({ pseudo:d.pseudo||'?', photoUrl:d.photoUrl||null, certified:d.certified||false, size:'sm', gradient:SIS.utils.pseudoToGradient(d.pseudo||''), onClick:function(p){ SIS.profilePopup.show(p); } }) +
            '<div class="disc-user-info">' +
              '<div class="disc-user-name">'+SIS.utils.escHtml(d.pseudo||'?')+certSvg+'</div>' +
              '<div class="disc-user-sub">'+SIS.utils.formatCount(d.followers||0)+' abonnés</div>' +
            '</div>' +
            '<button class="btn-follow-disc not-following" data-uid="'+doc.id+'">Suivre</button>';

          var btn = item.querySelector('.btn-follow-disc');
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!user) { window.location.href='auth.html'; return; }
            var isNow = btn.classList.contains('following');
            btn.classList.toggle('following', !isNow);
            btn.classList.toggle('not-following', isNow);
            btn.textContent = !isNow ? 'Suivi ✓' : 'Suivre';

            /* Update Firestore */
            var batch = SIS.db.batch();
            var targetRef = SIS.db.collection('users').doc(doc.id);
            var myRef = SIS.db.collection('users').doc(user.uid);
            if (!isNow) {
              batch.update(targetRef, { followers: firebase.firestore.FieldValue.increment(1) });
              batch.update(myRef, { following: firebase.firestore.FieldValue.increment(1) });
              SIS.notifs.push(doc.id, SIS.notifs.TYPES.FOLLOW, { fromPseudo: null });
            } else {
              batch.update(targetRef, { followers: firebase.firestore.FieldValue.increment(-1) });
              batch.update(myRef, { following: firebase.firestore.FieldValue.increment(-1) });
            }
            batch.commit().catch(function(){});
          });

          SIS.bindAvatarClicks(item);
          wrap.appendChild(item);
        });
      });
    }

    function loadPopularPosts() {
      var wrap = q('popular-posts');
      if (!wrap) return;

      SIS.db.collection('posts').where('hidden','==',false)
        .orderBy('echoCount','desc').limit(5).get()
        .then(function(snap) {
          wrap.innerHTML = '';
          snap.forEach(function(doc) {
            var d = doc.data();
            var card = document.createElement('div');
            card.className = 'disc-post-card';
            card.innerHTML =
              '<div class="disc-post-header">' +
                SIS.renderAvatar({ pseudo:d.authorPseudo||'Anonyme', photoUrl:d.identity==='name'?d.authorPhoto:null, certified:d.identity==='name'&&d.authorCertified, size:'xs', gradient:SIS.utils.pseudoToGradient(d.authorPseudo||'') }) +
                '<div style="flex:1;min-width:0">' +
                  '<div style="font-size:12px;font-weight:600;color:var(--text)">'+(d.identity==='anon'?'Anonyme':SIS.utils.escHtml(d.authorPseudo||'?'))+'</div>' +
                  '<div style="font-size:10px;color:var(--muted)">'+SIS.utils.timeAgo(d.createdAt)+'</div>' +
                '</div>' +
                '<span class="post-type type-'+d.type+'">'+d.type+'</span>' +
              '</div>' +
              '<div class="disc-post-body">'+SIS.utils.parseText(SIS.utils.truncate(d.text||d.question||'',120))+'</div>' +
              '<div class="disc-post-stats">' +
                '<span>🔄 '+SIS.utils.formatCount(d.echoCount||0)+'</span>' +
                '<span>💬 '+SIS.utils.formatCount(d.commentsCount||0)+'</span>' +
              '</div>';
            card.addEventListener('click', function(){ window.location.href='feed.html?post='+doc.id; });
            SIS.bindAvatarClicks(card);
            wrap.appendChild(card);
          });
        });
    }

    function bindEvents() {
      var searchInput = q('disc-search-input');
      var clearBtn = q('disc-search-clear');

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          var val = this.value.trim();
          if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
          searchDebounced(val);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          if (searchInput) searchInput.value = '';
          clearBtn.style.display = 'none';
          q('search-results').style.display = 'none';
          q('disc-content').style.display = 'block';
        });
      }
    }

    bindEvents();
    loadTrending();
    loadSuggestedUsers();
    loadPopularPosts();
    SIS.injectBottomNav('decouvrir');
  }


  /* ── APPEL BOOTSTRAP — après TOUTES les déclarations ── */
  /* Var hoisting : tous les modules sont définis ici */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap(); /* DOM déjà prêt */
  }

})();
