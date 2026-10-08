import React, { createContext, useContext, useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { apiClient } from '../api/client';

const AuthContext = createContext(null);

export const SSO_CONFIG = {
  authUrl: 'https://gerbang.unpak.ac.id/realms/gateway/protocol/openid-connect/auth',
  tokenUrl: '/api/sso/token',
  logoutUrl: '/api/sso/logout',
  userInfoUrl: '/api/sso/userinfo',
  clientId: 'hrportal',
  get redirectUri() {
    return `${window.location.origin}/login`;
  },
};

// --- DEFINISI GROUP RESMI KEPEGAWAIAN UNPAK ---
// Role SDM (Administrator Kepegawaian & SDM) HANYA:
export const OFFICIAL_SDM_GROUPS = ['adm_sdm', 'inherit_adm_sdm', 'adm_hr'];

// Role BAUM (Biro Administrasi Umum) HANYA:
export const OFFICIAL_BAUM_GROUPS = ['baum', 'inherit_baum'];

// Role Dosen (Tenaga Pendidik / Dosen) CN di Keycloak: Dosen
export const OFFICIAL_DOSEN_GROUPS = ['Dosen', 'dosen'];

// Role Tendik (Tenaga Kependidikan) CN di Keycloak: Tendik
export const OFFICIAL_TENDIK_GROUPS = ['Tendik', 'tendik'];

export const showAccessDeniedAlert = (onConfirm) => {
  Swal.fire({
    icon: 'error',
    title: 'Akses Ditolak!',
    html: `
      <div style="font-size: 0.95rem; color: #374151; line-height: 1.5; margin-top: 8px;">
        Akun Anda tidak memiliki <strong>Group Resmi</strong> di lingkungan kepegawaian Universitas Pakuan untuk mengakses HR Portal.
      </div>
      <div style="font-size: 0.85rem; color: #4b5563; margin-top: 12px; background: #fef2f2; padding: 12px; border-radius: 8px; border: 1px solid #fee2e2; text-align: center;">
        Silakan buat laporan ke <strong>Helpdesk UNPAK</strong>:<br />
        <a href="https://helpdesk.unpak.ac.id" target="_blank" rel="noopener noreferrer" style="color: #dc2626; font-weight: 600; text-decoration: underline; margin-top: 4px; display: inline-block;">
          https://helpdesk.unpak.ac.id
        </a>
      </div>
    `,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Keluar ke SSO',
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: {
      popup: 'rounded-2xl shadow-2xl',
      confirmButton: 'rounded-xl px-6 py-2.5 font-bold',
    },
  }).then(() => {
    if (onConfirm) onConfirm();
  });
};

export const decodeJwt = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(payload)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode JWT:', e);
    return {};
  }
};

export const getUserRole = (userInfo) => {
  if (!userInfo || typeof userInfo !== 'object') return 'tendik';
  const { level, role, groups = [], realmRoles = [] } = userInfo;
  const normLevel = (level || '').toLowerCase();
  const normRole = (role || '').toLowerCase();

  const safeGroups = Array.isArray(groups) ? groups : (typeof groups === 'string' ? groups.split(/[\s,]+/) : []);
  const safeRoles = Array.isArray(realmRoles) ? realmRoles : [];
  const allGroups = [
    ...safeGroups.map((g) => (typeof g === 'string' ? g.toLowerCase().trim().replace(/^\//, '') : '')),
    ...safeRoles.map((r) => (typeof r === 'string' ? r.toLowerCase().trim() : '')),
  ].filter(Boolean);

  let detectedRole = 'tendik';

  const normSdm = OFFICIAL_SDM_GROUPS.map((x) => x.toLowerCase());
  const normBaum = OFFICIAL_BAUM_GROUPS.map((x) => x.toLowerCase());
  const normDosen = OFFICIAL_DOSEN_GROUPS.map((x) => x.toLowerCase());
  const normTendik = OFFICIAL_TENDIK_GROUPS.map((x) => x.toLowerCase());

  // 1. Prioritaskan SDM jika memiliki salah satu grup resmi SDM (adm_sdm, inherit_adm_sdm, adm_hr)
  if (allGroups.some((g) => normSdm.includes(g)) || normLevel === 'sdm' || normRole === 'sdm') {
    detectedRole = 'sdm';
  // 2. BAUM jika memiliki grup BAUM
  } else if (allGroups.some((g) => normBaum.includes(g)) || normLevel === 'baum' || normRole === 'baum') {
    detectedRole = 'baum';
  // 3. Dosen jika memiliki grup Dosen (Dosen / dosen)
  } else if (allGroups.some((g) => normDosen.includes(g)) || normLevel === 'dosen' || normRole === 'dosen') {
    detectedRole = 'dosen';
  // 4. Tendik jika memiliki grup Tendik (Tendik / tendik)
  } else if (allGroups.some((g) => normTendik.includes(g)) || normLevel === 'tendik' || normRole === 'tendik' || normRole === 'pegawai') {
    detectedRole = 'tendik';
  }

  // Validate active_role override against available roles
  const activeOverride = localStorage.getItem('active_role');
  if (activeOverride && ['sdm', 'baum', 'dosen', 'tendik'].includes(activeOverride.toLowerCase())) {
    const available = getAvailableRoles(userInfo);
    if (available.includes(activeOverride.toLowerCase())) {
      return activeOverride.toLowerCase();
    }
  }

  return detectedRole;
};

export const getAvailableRoles = (userInfo) => {
  let userObj = userInfo;
  if (!userObj || typeof userObj !== 'object') {
    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser) userObj = JSON.parse(savedUser);
    } catch (e) {}
  }

  let profileObj = null;
  try {
    const savedProf = localStorage.getItem('profile');
    if (savedProf) profileObj = JSON.parse(savedProf);
  } catch (e) {}

  const collectGroups = [];

  if (userObj) {
    if (Array.isArray(userObj.groups)) collectGroups.push(...userObj.groups);
    else if (typeof userObj.groups === 'string') collectGroups.push(...userObj.groups.split(/[\s,]+/));

    if (Array.isArray(userObj.realmRoles)) collectGroups.push(...userObj.realmRoles);
    if (userObj.level) collectGroups.push(userObj.level);
    if (userObj.role) collectGroups.push(userObj.role);
  }

  if (profileObj) {
    if (Array.isArray(profileObj.groups)) collectGroups.push(...profileObj.groups);
    else if (typeof profileObj.groups === 'string') collectGroups.push(...profileObj.groups.split(/[\s,]+/));

    if (Array.isArray(profileObj.realmRoles)) collectGroups.push(...profileObj.realmRoles);
    if (profileObj.level) collectGroups.push(profileObj.level);
    if (profileObj.role) collectGroups.push(profileObj.role);
  }

  const normGroups = collectGroups.map((g) => (typeof g === 'string' ? g.toLowerCase().trim().replace(/^\//, '') : ''));
  const availableSet = new Set();

  normGroups.forEach((g) => {
    if (!g) return;
    if (OFFICIAL_SDM_GROUPS.some((s) => s.toLowerCase() === g)) {
      availableSet.add('sdm');
    }
    if (OFFICIAL_BAUM_GROUPS.some((b) => b.toLowerCase() === g)) {
      availableSet.add('baum');
    }
    if (OFFICIAL_DOSEN_GROUPS.some((d) => d.toLowerCase() === g)) {
      availableSet.add('dosen');
    }

    if (OFFICIAL_TENDIK_GROUPS.some((t) => t.toLowerCase() === g)) {
      availableSet.add('tendik');
    }
  });

  if (availableSet.size === 0) {
    availableSet.add('tendik');
  }

  console.log(normGroups, availableSet)

  return Array.from(availableSet);
};

export const canSwitchRole = (userInfo) => {
  const roles = getAvailableRoles(userInfo);
  return roles.length > 1;
};

// Cek Otorisasi: Pengguna HANYA diizinkan masuk jika memiliki Group Resmi Kepegawaian UNPAK
export const isUserAuthorized = (userInfo) => {
  if (!userInfo || typeof userInfo !== 'object') return false;
  const { level, role, groups = [], realmRoles = [] } = userInfo;
  const normLevel = (level || '').toLowerCase();
  const normRole = (role || '').toLowerCase();

  // Jika level / role profil database sudah terdaftar resmi
  if (['sdm', 'baum', 'dosen', 'tendik'].includes(normLevel) || ['sdm', 'baum', 'dosen', 'tendik', 'pegawai'].includes(normRole)) {
    return true;
  }

  const safeGroups = Array.isArray(groups) ? groups : (typeof groups === 'string' ? groups.split(/[\s,]+/) : []);
  const safeRoles = Array.isArray(realmRoles) ? realmRoles : [];
  const allGroups = [
    ...safeGroups.map((g) => (typeof g === 'string' ? g.toLowerCase().trim().replace(/^\//, '') : '')),
    ...safeRoles.map((r) => (typeof r === 'string' ? r.toLowerCase().trim() : '')),
  ].filter(Boolean);

  const hasSdm = allGroups.some((g) => OFFICIAL_SDM_GROUPS.some((s) => s.toLowerCase() === g));
  const hasBaum = allGroups.some((g) => OFFICIAL_BAUM_GROUPS.some((b) => b.toLowerCase() === g));
  const hasDosen = allGroups.some((g) => OFFICIAL_DOSEN_GROUPS.some((d) => d.toLowerCase() === g));
  const hasTendik = allGroups.some((g) => OFFICIAL_TENDIK_GROUPS.some((t) => t.toLowerCase() === g));

  return hasSdm || hasBaum || hasDosen || hasTendik;
};

export const isSdmAuthorized = (userInfo) => {
  return getUserRole(userInfo) === 'sdm';
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh') || localStorage.getItem('refresh_token');
      if (refreshToken) {
        await fetch(SSO_CONFIG.logoutUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: SSO_CONFIG.clientId,
            refresh_token: refreshToken,
          }),
        });
      }
    } catch (e) {
      console.warn('Keycloak POST logout note:', e);
    }

    sessionStorage.setItem('just_logged_out', 'true');
    setUser(null);
    setToken('');
    localStorage.clear();

    const origin = window.location.origin;
    window.location.href = `${origin}/login?logged_out=true`;
  };

  useEffect(() => {
    const handleLogout = () => {
      logout();
    };
    window.addEventListener('auth-logout', handleLogout);
    return () => window.removeEventListener('auth-logout', handleLogout);
  }, []);

  const refreshAccessToken = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh') || localStorage.getItem('refresh_token');
      if (!refreshToken) return { success: false, error: 'Refresh token tidak ditemukan' };

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: SSO_CONFIG.clientId,
        refresh_token: refreshToken,
      });

      const response = await fetch(SSO_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Refresh token Gagal (${response.status})`);
      }

      const tokenData = await response.json();
      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token || refreshToken;
      const newIdToken = tokenData.id_token || localStorage.getItem('id_token') || '';

      if (!newAccessToken) {
        throw new Error('Access Token baru tidak diterima dari Keycloak');
      }

      setToken(newAccessToken);
      localStorage.setItem('token', newAccessToken);
      localStorage.setItem('refresh', newRefreshToken);
      if (newIdToken) {
        localStorage.setItem('id_token', newIdToken);
      }

      window.dispatchEvent(new CustomEvent('token-refreshed', { detail: newAccessToken }));
      return { success: true, accessToken: newAccessToken };
    } catch (err) {
      console.warn('Auto refresh token gagal:', err);
      return { success: false, error: err.message };
    }
  };

  useEffect(() => {
    const handleTokenRefreshed = (e) => {
      if (e.detail) {
        setToken(e.detail);
      }
    };
    window.addEventListener('token-refreshed', handleTokenRefreshed);
    return () => window.removeEventListener('token-refreshed', handleTokenRefreshed);
  }, []);

  // Periodic Auto Refresh Token (Every 3.5 minutes if user logged in)
  useEffect(() => {
    console.log("==periodic refresh session==")
    if (!token) return;

    const interval = setInterval(async () => {
      const refreshToken = localStorage.getItem('refresh') || localStorage.getItem('refresh_token');
      if (refreshToken) {
        await refreshAccessToken();
        console.log("sesi sudah diupdate")
      }
    }, 210000); // 210,000 ms = 3.5 minutes

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      const refreshToken = localStorage.getItem('refresh') || localStorage.getItem('refresh_token');

      if (savedToken && savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          const decoded = decodeJwt(savedToken);
          const nowInSec = Math.floor(Date.now() / 1000);

          let activeToken = savedToken;

          // 1. Proactive check: if access token is expired or expires in less than 30s
          if (decoded.exp && decoded.exp < nowInSec + 30 && refreshToken) {
            console.log('Access token expired saat initAuth, mencoba auto-refresh...');
            const refreshRes = await refreshAccessToken();
            if (refreshRes.success && refreshRes.accessToken) {
              activeToken = refreshRes.accessToken;
            } else {
              // Refresh token juga kedaluwarsa / di-revoke -> bersihkan sesi & redirect ke login
              setUser(null);
              setToken('');
              localStorage.clear();
              setLoading(false);
              return;
            }
          }

          // 2. Real-time Token Introspection & Auto Group Sync ke Keycloak Setiap Refresh Halaman
          try {
            const introRes = await fetch(SSO_CONFIG.userInfoUrl, {
              headers: { Authorization: `Bearer ${activeToken}` },
            });

            if (introRes.ok) {
              const liveUserInfo = await introRes.json();
              const liveRawGroups = liveUserInfo.groups || liveUserInfo.group || [];
              const liveGroups = Array.isArray(liveRawGroups)
                ? liveRawGroups
                : (typeof liveRawGroups === 'string' ? liveRawGroups.split(/[\s,]+/) : []);

              if (liveGroups.length > 0) {
                parsedUser.groups = liveGroups;
              }
              if (liveUserInfo.name) parsedUser.name = liveUserInfo.name;
              if (liveUserInfo.email) parsedUser.email = liveUserInfo.email;
              if (liveUserInfo.preferred_username) parsedUser.username = liveUserInfo.preferred_username;

              // Hitung ulang role secara real-time berdasarkan group terbaru dari Keycloak
              const updatedRole = getUserRole(parsedUser);
              parsedUser.role = updatedRole;
              parsedUser.level = updatedRole;
              localStorage.setItem('user', JSON.stringify(parsedUser));

              // Selalu perbarui JWT access token via refresh token agar backend API juga menerima token baru berisi adm_hr
              if (refreshToken) {
                try {
                  const refreshed = await refreshAccessToken();
                  if (refreshed.success && refreshed.accessToken) {
                    activeToken = refreshed.accessToken;
                    const newlyDecoded = decodeJwt(refreshed.accessToken);
                    const freshRawGroups = newlyDecoded.groups || newlyDecoded.group || [];
                    const freshGroups = Array.isArray(freshRawGroups)
                      ? freshRawGroups
                      : (typeof freshRawGroups === 'string' ? freshRawGroups.split(/[\s,]+/) : []);
                    if (freshGroups.length > 0) {
                      parsedUser.groups = freshGroups;
                      const freshRole = getUserRole(parsedUser);
                      parsedUser.role = freshRole;
                      parsedUser.level = freshRole;
                      localStorage.setItem('user', JSON.stringify(parsedUser));
                    }
                  }
                } catch (e) {
                  console.warn('Background token refresh note:', e);
                }
              }
            } else if (introRes.status === 401 || introRes.status === 403) {
              console.warn(`Keycloak userinfo invalid (${introRes.status}), mencoba refresh token...`);
              if (refreshToken) {
                const retryRefresh = await refreshAccessToken();
                if (retryRefresh.success && retryRefresh.accessToken) {
                  const retryIntro = await fetch(SSO_CONFIG.userInfoUrl, {
                    headers: { Authorization: `Bearer ${retryRefresh.accessToken}` },
                  });
                  if (!retryIntro.ok) {
                    console.warn('Sesi Keycloak telah berakhir. Menghancurkan sesi lokal...');
                    setUser(null);
                    setToken('');
                    localStorage.clear();
                    setLoading(false);
                    return;
                  }
                  activeToken = retryRefresh.accessToken;
                } else {
                  setUser(null);
                  setToken('');
                  localStorage.clear();
                  setLoading(false);
                  return;
                }
              } else {
                setUser(null);
                setToken('');
                localStorage.clear();
                setLoading(false);
                return;
              }
            } else {
              console.warn(`Keycloak userinfo non-auth status (${introRes.status}), mempertahankan sesi aktif.`);
            }
          } catch (netErr) {
            console.warn('Network issue during Keycloak userinfo verification:', netErr);
          }

          // 3. Validasi Hak Akses Group Resmi
          if (!isUserAuthorized(parsedUser)) {
            showAccessDeniedAlert(() => {
              logout();
            });
            setLoading(false);
            return;
          }

          setUser(parsedUser);
          setToken(activeToken);
        } catch (e) {
          console.warn('Error parsing saved user from localStorage:', e);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const saveAuthSession = (authToken, refreshToken, userInfo, idToken = '') => {
    setToken(authToken);
    setUser(userInfo);
    localStorage.setItem('token', authToken);
    if (refreshToken) {
      localStorage.setItem('refresh', refreshToken);
    }
    if (idToken) {
      localStorage.setItem('id_token', idToken);
    }
    localStorage.setItem('user', JSON.stringify(userInfo));
  };

  const fetchWhoAmI = async (authToken) => {
    try {
      const res = await apiClient.get('/api/v2/account/whoami');
      if (res) {
        localStorage.removeItem('whoami');
        localStorage.removeItem('user_profile');
        localStorage.setItem('profile', JSON.stringify(res));
        setUser((currentUser) => {
          const baseUser = currentUser || {};
          // Jaga role SDM / BAUM / Dosen dari SSO agar TIDAK DITIMPA oleh level pegawai SIMPEG lokal
          const ssoRole = getUserRole(baseUser);
          const detectedRole = (ssoRole === 'sdm' || ssoRole === 'baum' || ssoRole === 'dosen')
            ? ssoRole
            : (res.level || res.role || baseUser.role || 'tendik');

          const updatedUser = {
            ...baseUser,
            name: res.name || baseUser.name || 'Pengguna HR Portal',
            email: baseUser.email || '',
            username: res.nip || res.sid || baseUser.username || '',
            nip: res.nip || baseUser.nip || '',
            nidn: res.nidn || baseUser.nidn || '',
            role: detectedRole,
            level: detectedRole,
            fakultas: res.fakultas || baseUser.fakultas || '',
            prodi: res.prodi || baseUser.prodi || '',
            unit: res.unit || baseUser.unit || '',
            groups: baseUser.groups || [],
            realmRoles: baseUser.realmRoles || [],
            isSso: baseUser.isSso || false,
          };
          localStorage.setItem('user', JSON.stringify(updatedUser));
          return updatedUser;
        });
      }
    } catch (e) {
      console.warn('Gagal memperbarui data profil whoami:', e);
    }
  };

  const loginRegular = async (usernameInput, passwordInput, selectedRole = 'sdm') => {
    try {
      const res = await apiClient.postForm('/api/v2/account/login', {
        username: usernameInput,
        password: passwordInput,
      });

      const authToken = res.token || res.access_token || '';
      const refreshToken = res.refresh || res.refresh_token || '';

      if (!authToken) {
        return { success: false, error: res.message || 'Token tidak diterima dari server' };
      }

      const decoded = decodeJwt(authToken);
      const roleAssigned = decoded.level || res.level || selectedRole || 'sdm';
      const userInfo = {
        name: decoded.name || res.name || usernameInput,
        email: decoded.email || res.email || '',
        username: usernameInput,
        nip: res.nip || usernameInput,
        nidn: res.nidn || '-',
        role: roleAssigned,
        level: roleAssigned,
      };

      if (decoded.employeeid) {
        userInfo.employeeId = decoded.employeeid || userInfo.nip;
      }

      saveAuthSession(authToken, refreshToken, userInfo);
      fetchWhoAmI(authToken);
      return { success: true, user: userInfo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const exchangeSsoCode = async (code) => {
    try {
      const origin = window.location.origin;
      const redirectUri = `${origin}/login`;

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: SSO_CONFIG.clientId,
        code: code,
        redirect_uri: redirectUri,
      });

      const response = await fetch(SSO_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`SSO Exchange Gagal (${response.status}): ${errText}`);
      }

      const tokenData = await response.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || '';
      const idToken = tokenData.id_token || '';

      if (!accessToken) {
        throw new Error('Access Token tidak ditemukan dalam respon SSO');
      }

      const tokenToDecode = idToken || accessToken;
      const decoded = decodeJwt(tokenToDecode);

      const name = decoded.name || decoded.preferred_username || decoded.employeeid || 'User SSO';
      const email = decoded.email || '';
      const employeeId = decoded.employeeid || decoded.sub || '-';
      const rawGroups = decoded.groups || decoded.group || [];
      const groups = Array.isArray(rawGroups) ? rawGroups : (typeof rawGroups === 'string' ? rawGroups.split(/[\s,]+/) : []);
      const realmRoles = decoded.realm_access?.roles || [];

      const tempUser = { groups, realmRoles, level: decoded.level || decoded.role };

      // Validasi Hak Akses Group Resmi
      if (!isUserAuthorized(tempUser)) {
        showAccessDeniedAlert(() => {
          logout();
        });
        return { success: false, error: 'Akses Ditolak: Anda tidak memiliki Group Resmi di HR Portal.' };
      }

      const role = getUserRole(tempUser);

      const userInfo = {
        name,
        email,
        username: employeeId,
        nip: employeeId,
        nidn: '-',
        role: role,
        level: role,
        groups,
        realmRoles,
        isSso: true,
      };

      saveAuthSession(accessToken, refreshToken, userInfo, idToken);
      fetchWhoAmI(accessToken);
      return { success: true, user: userInfo };
    } catch (err) {
      console.error('SSO Code Exchange Error:', err);
      return { success: false, error: err.message || 'Gagal bertukar kode SSO Keycloak' };
    }
  };

  const loginWithSsoToken = (accessToken, idToken) => {
    try {
      const tokenToDecode = idToken || accessToken;
      const decoded = decodeJwt(tokenToDecode);
      
      const name = decoded.name || decoded.preferred_username || 'User SSO';
      const email = decoded.email || '';
      const employeeId = decoded.employeeid || decoded.sub || '-';
      const rawGroups = decoded.groups || decoded.group || [];
      const groups = Array.isArray(rawGroups) ? rawGroups : (typeof rawGroups === 'string' ? rawGroups.split(/[\s,]+/) : []);


      const realmRoles = decoded.realm_access?.roles || [];

      const tempUser = { groups, realmRoles, level: decoded.level || decoded.role };

      // Validasi Hak Akses Group Resmi
      if (!isUserAuthorized(tempUser)) {
        showAccessDeniedAlert(() => {
          logout();
        });
        return { success: false, error: 'Akses Ditolak: Anda tidak memiliki Group Resmi di HR Portal.' };
      }

      const role = getUserRole(tempUser);

      const userInfo = {
        name,
        email,
        username: employeeId,
        nip: employeeId,
        nidn: '-',
        role: role,
        level: role,
        groups,
        realmRoles,
        isSso: true,
      };

      saveAuthSession(accessToken, '', userInfo, idToken);
      fetchWhoAmI(accessToken);
      return { success: true, user: userInfo };
    } catch (err) {
      console.error('SSO Token Login Error:', err);
      return { success: false, error: err.message };
    }
  };

  const triggerSsoRedirect = (forcePromptLogin = false) => {
    const origin = window.location.origin;
    const redirectUri = `${origin}/login`;
    let url = `${SSO_CONFIG.authUrl}?client_id=${SSO_CONFIG.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid`;

    const wasLoggedOut = sessionStorage.getItem('just_logged_out') === 'true';
    if (forcePromptLogin || wasLoggedOut) {
      sessionStorage.removeItem('just_logged_out');
      url += '&prompt=login';
    }

    window.location.href = url;
  };

  const [activeRoleOverride, setActiveRoleOverride] = useState(() => localStorage.getItem('active_role') || null);

  const switchRole = (newRole) => {
    const norm = (newRole || 'tendik').toLowerCase();
    setActiveRoleOverride(norm);
    localStorage.setItem('active_role', norm);

    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, role: norm, level: norm };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });

    try {
      const savedProf = localStorage.getItem('profile');
      if (savedProf) {
        const prof = JSON.parse(savedProf);
        prof.level = norm;
        prof.role = norm;
        localStorage.setItem('profile', JSON.stringify(prof));
      }
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('role-changed', { detail: norm }));
  };

  const userRole = activeRoleOverride || getUserRole(user);
  const isSdm = userRole === 'sdm';
  const isBaum = userRole === 'baum';
  const isDosen = userRole === 'dosen';
  const isTendik = userRole === 'tendik';

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    userRole,
    isSdm,
    isBaum,
    isDosen,
    isTendik,
    availableRoles: getAvailableRoles(user),
    canSwitchRole: canSwitchRole(user),
    switchRole,
    loginRegular,
    exchangeSsoCode,
    loginWithSsoToken,
    triggerSsoRedirect,
    refreshAccessToken,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
