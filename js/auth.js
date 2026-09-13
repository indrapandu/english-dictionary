(function () {
    "use strict";

    const config = window.APP_CONFIG || {};
    const isConfigured = Boolean(
        config.supabaseUrl &&
        config.supabaseKey &&
        !config.supabaseUrl.startsWith("YOUR_") &&
        !config.supabaseKey.startsWith("YOUR_")
    );

    const client = isConfigured && window.supabase?.createClient
        ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey)
        : null;

    async function requireAuth() {
        if (!isConfigured) return { preview: true, user: null };
        if (!client) {
            window.location.replace("login.html");
            return null;
        }

        const { data, error } = await client.auth.getSession();
        if (error || !data.session) {
            window.location.replace("login.html");
            return null;
        }

        return { preview: false, user: data.session.user };
    }

    async function signIn(email, password) {
        if (!isConfigured) {
            throw new Error("Supabase has not been configured yet. Update js/config.js first.");
        }
        if (!client) throw new Error("The sign-in service could not load. Check your connection and refresh this page.");

        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    async function signOut() {
        if (client) await client.auth.signOut();
        window.location.replace("login.html");
    }

    async function initializeLoginPage() {
        const form = document.getElementById("loginForm");
        if (!form) return;

        const message = document.getElementById("loginMessage");
        const button = document.getElementById("loginButton");

        if (client) {
            const { data } = await client.auth.getSession();
            if (data.session) {
                window.location.replace("index.html");
                return;
            }
        } else if (isConfigured) {
            message.textContent = "The sign-in service could not load. Check your connection and refresh this page.";
        } else {
            message.textContent = "Setup required: add your Supabase Project URL and publishable key in js/config.js.";
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            message.textContent = "";
            button.disabled = true;
            button.textContent = "Logging in...";

            try {
                await signIn(
                    document.getElementById("emailInput").value.trim(),
                    document.getElementById("passwordInput").value
                );
                window.location.replace("index.html");
            } catch (error) {
                message.textContent = error.message || "Login failed. Please try again.";
            } finally {
                button.disabled = false;
                button.textContent = "Log in";
            }
        });
    }

    window.DictionaryAuth = {
        client,
        isConfigured,
        requireAuth,
        signOut
    };

    client?.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" && !document.getElementById("loginForm")) {
            window.location.replace("login.html");
        }
    });

    document.addEventListener("DOMContentLoaded", initializeLoginPage);
}());
