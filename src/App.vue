<script setup>
import { computed, onMounted, ref } from "vue";
import { biometric } from "./biometric.js";
import { getBiometricEnableErrorMessage } from "./biometric-errors.js";
import { getDatabase, getUserById, loginUser, registerUser } from "./db.js";

const mode = ref("login");
const currentUser = ref(null);
const databaseReady = ref(false);
const databaseError = ref("");
const submitting = ref(false);
const formError = ref("");
const formSuccess = ref("");
const biometricSupported = ref(false);
const biometricEnrollment = ref(null);
const biometricBusy = ref(false);
const securityError = ref("");
const securityMessage = ref("");
const showDisableForm = ref(false);
const disablePassword = ref("");
const biometricEnabledForUser = computed(
  () =>
    currentUser.value &&
    biometricEnrollment.value?.userId === currentUser.value.id,
);
const biometricReservedForAnotherUser = computed(
  () =>
    currentUser.value &&
    biometricEnrollment.value &&
    biometricEnrollment.value.userId !== currentUser.value.id,
);
const form = ref({ fullName: "", email: "", password: "", confirmPassword: "" });

onMounted(async () => {
  try {
    await getDatabase();
    databaseReady.value = true;
    biometricEnrollment.value = await biometric.getEnrollment();
    if (await biometric.isAvailable()) {
      biometricSupported.value = true;
      if (biometricEnrollment.value) {
        const enrolledUser = await getUserById(biometricEnrollment.value.userId);
        if (enrolledUser) {
          form.value.email = enrolledUser.email;
          mode.value = "biometric";
        } else {
          formError.value =
            "The saved profile is unavailable. Sign in with your password to continue.";
        }
      }
    } else if (biometricEnrollment.value) {
      formError.value =
        "Biometric unlock isn't available right now. Sign in with your password.";
    }
  } catch {
    if (!databaseReady.value) {
      databaseError.value =
        "We couldn't open your local database. Please refresh and try again.";
    } else {
      formError.value =
        "Biometric unlock couldn't be checked. Sign in with your password instead.";
    }
  }
});

function switchMode(nextMode) {
  mode.value = nextMode;
  formError.value = "";
  formSuccess.value = "";
  form.value = { fullName: "", email: form.value.email, password: "", confirmPassword: "" };
}

function signIn(user) {
  currentUser.value = user;
  form.value.password = "";
  form.value.confirmPassword = "";
  formError.value = "";
  formSuccess.value = "";
  securityError.value = "";
  securityMessage.value = "";
  showDisableForm.value = false;
  disablePassword.value = "";
}

async function submitForm() {
  formError.value = "";
  formSuccess.value = "";
  submitting.value = true;

  try {
    if (mode.value === "register") {
      if (form.value.password !== form.value.confirmPassword) {
        formError.value = "Those passwords don't match. Please try again.";
        return;
      }
      const result = await registerUser(form.value);
      if (!result.ok) {
        formError.value = "An account with that email already exists.";
        return;
      }
      signIn(result.user);
      return;
    }

    const user = await loginUser(form.value);
    if (!user) {
      formError.value = "That email and password combination doesn't match.";
      return;
    }
    signIn(user);
  } catch {
    formError.value = "Something went wrong while saving your account. Please try again.";
  } finally {
    submitting.value = false;
  }
}

async function unlockWithBiometrics() {
  formError.value = "";
  biometricBusy.value = true;
  try {
    const userId = await biometric.unlock();
    if (!userId) throw new Error("No saved biometric account is available.");
    const user = await getUserById(userId);
    if (!user) throw new Error("The saved profile could not be found.");
    signIn(user);
  } catch {
    mode.value = "login";
    formError.value =
      "Biometric unlock was canceled or unavailable. Sign in with your password instead.";
  } finally {
    biometricBusy.value = false;
  }
}

async function enableBiometrics() {
  biometricBusy.value = true;
  securityError.value = "";
  securityMessage.value = "";
  try {
    await biometric.enable(currentUser.value);
    biometricEnrollment.value = await biometric.getEnrollment();
    securityMessage.value =
      "Biometric unlock is enabled on this device. Your password still works anytime.";
  } catch (error) {
    securityError.value = getBiometricEnableErrorMessage(error);
  } finally {
    biometricBusy.value = false;
  }
}

function requestDisableBiometrics() {
  securityError.value = "";
  securityMessage.value = "";
  showDisableForm.value = true;
}

async function disableBiometrics() {
  securityError.value = "";
  securityMessage.value = "";
  biometricBusy.value = true;
  try {
    const verifiedUser = await loginUser({
      email: currentUser.value.email,
      password: disablePassword.value,
    });
    if (!verifiedUser || verifiedUser.id !== currentUser.value.id) {
      securityError.value = "That password doesn't match your account.";
      return;
    }
    const removedPlatform = await biometric.disable(currentUser.value.id);
    biometricEnrollment.value = null;
    showDisableForm.value = false;
    disablePassword.value = "";
    securityMessage.value =
      removedPlatform === "webauthn"
        ? "Biometric unlock is off in Bioform. The passkey remains managed by your browser or authenticator."
        : "Biometric unlock is off. You can still sign in with your password.";
  } catch {
    securityError.value =
      "Biometric unlock couldn't be removed. Your account settings are unchanged.";
  } finally {
    biometricBusy.value = false;
  }
}

function signOut() {
  currentUser.value = null;
  form.value.password = "";
  form.value.confirmPassword = "";
  mode.value = biometricEnrollment.value ? "biometric" : "login";
  formError.value = "";
  securityError.value = "";
  securityMessage.value = "";
  showDisableForm.value = false;
  disablePassword.value = "";
}

function memberSince(value) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
    new Date(value),
  );
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Bioform home">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M5 17h6l3-8 5 15 3-7h5" />
          </svg>
        </span>
        <span>bioform</span>
      </a>
      <span class="privacy-note"><span class="privacy-dot"></span> Private by design</span>
    </header>

    <section v-if="!currentUser" class="auth-layout">
      <div class="welcome-panel">
        <div class="eyebrow"><span class="eyebrow-line"></span> A calmer kind of health app</div>
        <h1>Your health,<br /><span>in balance.</span></h1>
        <p class="welcome-copy">
          A thoughtful space for your biometric profile. Start with the basics,
          and make it your own.
        </p>
        <div class="welcome-art" aria-hidden="true">
          <div class="art-orbit orbit-outer"></div>
          <div class="art-orbit orbit-inner"></div>
          <div class="art-core"><span></span></div>
          <div class="art-spark spark-one"></div>
          <div class="art-spark spark-two"></div>
          <div class="art-caption">A little more in tune<br />with yourself.</div>
        </div>
        <div class="welcome-foot">
          <span class="foot-icon">✳</span>
          Your data stays on this device.
        </div>
      </div>

      <div class="form-column">
        <div class="form-card">
          <div class="form-heading">
            <div class="mobile-mark" aria-hidden="true">✳</div>
            <p class="form-kicker">
              {{ mode === "register" ? "YOUR NEXT CHAPTER" : "WELCOME BACK" }}
            </p>
            <h2>
              {{
                mode === "register"
                  ? "Create your account"
                  : mode === "biometric"
                    ? "Unlock your profile"
                    : "Sign in"
              }}
            </h2>
            <p class="form-subtitle">
              {{
                mode === "register"
                  ? "A few details, then you're all set."
                  : mode === "biometric"
                    ? "Use your device authenticator to unlock this local profile."
                    : "Pick up right where you left off."
              }}
            </p>
          </div>

          <div v-if="databaseError" class="notice notice-error" role="alert">
            {{ databaseError }}
          </div>
          <div v-else-if="!databaseReady" class="loading-note" role="status">
            Preparing your private space…
          </div>

          <div v-else-if="mode === 'biometric'" class="biometric-login">
            <div v-if="formError" class="notice notice-error" role="alert">
              {{ formError }}
            </div>
            <button
              class="primary-button"
              type="button"
              :disabled="biometricBusy"
              @click="unlockWithBiometrics"
            >
              <span>{{ biometricBusy ? "Waiting for your device…" : "Unlock this device" }}</span>
              <span class="button-arrow" aria-hidden="true">↗</span>
            </button>
            <p class="biometric-privacy">
              Your biometric or security key stays with your device. Bioform never receives it.
            </p>
            <button class="text-button" type="button" @click="switchMode('login')">
              Use your password instead
            </button>
          </div>

          <form v-else class="auth-form" @submit.prevent="submitForm">
            <label v-if="mode === 'register'" class="field">
              <span>Your name</span>
              <input
                v-model="form.fullName"
                type="text"
                name="fullName"
                autocomplete="name"
                placeholder="e.g. Alex Morgan"
                required
                minlength="2"
                maxlength="80"
              />
            </label>

            <label class="field">
              <span>Email address</span>
              <input
                v-model="form.email"
                type="email"
                name="email"
                autocomplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            <label class="field">
              <span>Password</span>
              <input
                v-model="form.password"
                type="password"
                name="password"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                placeholder="At least 8 characters"
                required
                minlength="8"
              />
            </label>

            <label v-if="mode === 'register'" class="field">
              <span>Confirm password</span>
              <input
                v-model="form.confirmPassword"
                type="password"
                name="confirmPassword"
                autocomplete="new-password"
                placeholder="Enter your password again"
                required
                minlength="8"
              />
            </label>

            <div v-if="formError" class="notice notice-error" role="alert">
              {{ formError }}
            </div>
            <div v-if="formSuccess" class="notice notice-success" role="status">
              {{ formSuccess }}
            </div>

            <button class="primary-button" type="submit" :disabled="submitting">
              <span>{{ submitting ? "One moment…" : mode === "login" ? "Sign in" : "Create account" }}</span>
              <span class="button-arrow" aria-hidden="true">↗</span>
            </button>
          </form>

          <div v-if="mode !== 'biometric'" class="form-switch">
            <template v-if="mode === 'login'">
              New to Bioform?
              <button type="button" @click="switchMode('register')">Create an account</button>
            </template>
            <template v-else>
              Already have an account?
              <button type="button" @click="switchMode('login')">Sign in</button>
            </template>
          </div>

          <p v-if="mode !== 'biometric'" class="form-legal">
            By continuing, you agree to keep your account details safe and private.
          </p>
        </div>
        <p class="copyright">© 2025 Bioform. A healthier relationship with your data.</p>
      </div>
    </section>

    <section v-else class="home-layout">
      <div class="home-heading">
        <div>
          <p class="form-kicker">YOUR SPACE</p>
          <h1>Good to see you, <span>{{ currentUser.fullName.split(" ")[0] }}.</span></h1>
          <p class="home-subtitle">A little check-in with your health profile.</p>
        </div>
        <button class="signout-button" type="button" @click="signOut">
          <span class="signout-icon" aria-hidden="true">↗</span>
          Sign out
        </button>
      </div>

      <div class="home-grid">
        <article class="profile-card">
          <div class="profile-top">
            <div class="avatar">{{ currentUser.fullName.charAt(0).toUpperCase() }}</div>
            <span class="profile-label"><span class="privacy-dot"></span> Profile active</span>
          </div>
          <p class="card-eyebrow">YOUR BIOFORM PROFILE</p>
          <h2>{{ currentUser.fullName }}</h2>
          <p class="profile-email">{{ currentUser.email }}</p>
          <div class="profile-divider"></div>
          <div class="profile-detail">
            <span>Member since</span>
            <strong>{{ memberSince(currentUser.createdAt) }}</strong>
          </div>
          <div class="profile-detail">
            <span>Data storage</span>
            <strong><span class="privacy-dot"></span> This device only</strong>
          </div>
        </article>

        <article class="welcome-card">
          <div class="welcome-card-art" aria-hidden="true">✳</div>
          <p class="card-eyebrow">A FRESH START</p>
          <h2>Your profile is ready<br />when you are.</h2>
          <p>
            This is your personal space for biometric insights. Connect a device
            or add your first reading whenever you're ready.
          </p>
          <span class="coming-soon"><span></span> Your journey starts here</span>
        </article>
      </div>

      <section v-if="biometricSupported" class="security-card">
        <div class="security-heading">
          <div>
            <p class="card-eyebrow">DEVICE SECURITY</p>
            <h2>Biometric unlock</h2>
            <p>
              Optional, device-local access with Windows Hello, Touch ID, or a
              compatible Linux fingerprint/FIDO2 authenticator. Availability varies.
            </p>
          </div>
          <span v-if="biometricEnabledForUser" class="profile-label">
            <span class="privacy-dot"></span> Enabled
          </span>
        </div>

        <p v-if="securityError" class="notice notice-error" role="alert">
          {{ securityError }}
        </p>
        <p v-if="securityMessage" class="notice notice-success" role="status">
          {{ securityMessage }}
        </p>
        <p v-if="biometricReservedForAnotherUser" class="security-note">
          Biometric unlock is set up for another local account. Sign in to that account to manage it.
        </p>
        <form v-else-if="biometricEnabledForUser && showDisableForm" class="disable-form" @submit.prevent="disableBiometrics">
          <label class="field">
            <span>Confirm your password to turn off biometric unlock</span>
            <input
              v-model="disablePassword"
              type="password"
              name="disablePassword"
              autocomplete="current-password"
              required
            />
          </label>
          <div class="security-actions">
            <button class="secondary-button" type="button" @click="showDisableForm = false">
              Keep it on
            </button>
            <button class="primary-button compact-button" type="submit" :disabled="biometricBusy">
              {{ biometricBusy ? "Checking…" : "Confirm and turn off" }}
            </button>
          </div>
        </form>
        <div v-else-if="biometricEnabledForUser" class="security-actions">
          <p class="security-note">Password sign-in is always available as a fallback.</p>
          <button class="secondary-button" type="button" @click="requestDisableBiometrics">
            Turn off biometric unlock
          </button>
        </div>
        <div v-else class="security-actions">
          <p class="security-note">
            Uses an OS-protected mobile credential or a locally verified
            WebAuthn keypair; no private key is stored in the app database.
          </p>
          <button class="primary-button compact-button" type="button" :disabled="biometricBusy" @click="enableBiometrics">
            {{ biometricBusy ? "Preparing…" : "Enable biometric unlock" }}
          </button>
        </div>
      </section>

      <div class="home-footer">
        <span class="foot-icon">✳</span>
        Your account is stored locally on this device, not in the cloud.
      </div>
    </section>
  </main>
</template>
