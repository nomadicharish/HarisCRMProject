import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { auth } from "../firebase";
import BrandLogo from "../components/common/BrandLogo";
import { cacheRightsAtLogin } from "../utils/rights";
import { getDashboardPathByRole, storeSession } from "../utils/auth";
import { writeCached } from "../services/cachedApi";
import "../styles/auth.css";

const OTP_LENGTH = 6;

function EmailCheckIcon() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="10" y="15" width="38" height="29" rx="4" stroke="currentColor" strokeWidth="3" /><path d="m12 18 17 14 17-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="47" cy="43" r="12" fill="#1264dc" /><path d="m41.5 43 3.5 3.5 7-7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function readPendingOtp() {
  try {
    const stored = sessionStorage.getItem("super_user_otp_pending");
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function VerifyOtp() {
  const navigate = useNavigate();
  const inputRefs = useRef([]);
  const [pending, setPending] = useState(readPendingOtp);
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!pending) { navigate("/login", { replace: true }); return undefined; }
    return onAuthStateChanged(auth, (user) => { if (!user) navigate("/login", { replace: true }); });
  }, [navigate, pending]);
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  const secondsRemaining = Math.max(0, Math.ceil(((pending?.expiresAtMs || 0) - now) / 1000));
  const resendSeconds = Math.max(0, Math.ceil(((pending?.resendAvailableAtMs || 0) - now) / 1000));
  const otp = digits.join("");

  const backToLogin = async () => {
    sessionStorage.removeItem("super_user_otp_pending");
    await signOut(auth).catch(() => undefined);
    navigate("/login", { replace: true });
  };

  const updateDigits = (value, index) => {
    const values = String(value || "").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!values) { setDigits((current) => current.map((digit, digitIndex) => digitIndex === index ? "" : digit)); return; }
    setDigits((current) => {
      const next = [...current];
      values.split("").forEach((digit, offset) => { if (index + offset < OTP_LENGTH) next[index + offset] = digit; });
      return next;
    });
    inputRefs.current[Math.min(index + values.length, OTP_LENGTH - 1)]?.focus();
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    if (otp.length !== OTP_LENGTH) { setError("Enter the complete 6-digit verification code"); return; }
    setLoading(true); setError("");
    try {
      await API.post("/auth/login-otp/verify", { otp });
      const token = await auth.currentUser.getIdToken(true);
      const response = await API.get("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      const userData = response.data;
      storeSession({ token, user: userData });
      cacheRightsAtLogin(userData);
      writeCached("/auth/me", userData, { ttlMs: 24 * 60 * 60 * 1000 });
      sessionStorage.removeItem("super_user_otp_pending");
      navigate(pending?.requestedPath || getDashboardPathByRole(userData.role), { replace: true });
    } catch (err) { setError(err?.response?.data?.message || "Unable to verify the code. Please try again."); }
    finally { setLoading(false); }
  };

  const resendOtp = async () => {
    if (resendSeconds > 0 || resending) return;
    setResending(true); setError("");
    try {
      const response = await API.post("/auth/login-otp/request");
      const nextPending = { ...pending, ...response.data };
      sessionStorage.setItem("super_user_otp_pending", JSON.stringify(nextPending));
      setPending(nextPending); setDigits(Array(OTP_LENGTH).fill("")); inputRefs.current[0]?.focus();
    } catch (err) { setError(err?.response?.data?.message || "Unable to resend the code. Please try again."); }
    finally { setResending(false); }
  };

  const minutes = String(Math.floor(secondsRemaining / 60)).padStart(2, "0");
  const seconds = String(secondsRemaining % 60).padStart(2, "0");
  return <div className="authPage otpPage">
    <div className="authBrand"><BrandLogo className="authBrandIcon" /></div>
    <div className="authCard authCardWide otpCard"><div className="authTopBar">
      <div className="authHeroIcon"><EmailCheckIcon /></div><h1 className="authTitle otpTitle">Verify Your Email</h1>
      <p className="authSubtitle otpSubtitle">We’ve sent a 6-digit OTP to <strong>{pending?.maskedEmail}</strong>.<br />Please enter the OTP below to continue.</p>
    </div><div className="authBody"><form className="authForm" onSubmit={verifyOtp}>
      <div className="authField"><label className="authLabel" htmlFor="otp-digit-0">Enter OTP</label><div className="otpInputs">
        {digits.map((digit, index) => <input key={index} ref={(element) => { inputRefs.current[index] = element; }} id={`otp-digit-${index}`} className="otpInput" inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength="6" value={digit} onChange={(event) => updateDigits(event.target.value, index)} onKeyDown={(event) => { if (event.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus(); }} aria-label={`OTP digit ${index + 1}`} />)}
      </div></div>
      <div className={`otpTimer ${secondsRemaining === 0 ? "otpTimerExpired" : ""}`}><ClockIcon />{secondsRemaining ? <>OTP expires in <strong>{minutes}:{seconds}</strong></> : "OTP has expired"}</div>
      {error ? <div className="authError">{error}</div> : null}
      <div className="authActions"><button type="submit" className="authPrimaryBtn" disabled={loading || secondsRemaining === 0}>{loading ? "Verifying..." : "Verify OTP"}</button></div>
      <div className="authDivider">or</div><div className="authLinks"><button type="button" className="authLinkBtn" onClick={backToLogin}>←&nbsp; Back to Login</button></div>
      <p className="otpResend">Didn’t receive the OTP? <button type="button" className="authLinkBtn" onClick={resendOtp} disabled={resendSeconds > 0 || resending}>{resending ? "Sending..." : resendSeconds ? `Resend OTP (${resendSeconds}s)` : "Resend OTP"}</button></p>
    </form></div></div>
    <div className="authFooterText">© 2026 Talent Acquisition. All rights reserved.</div>
  </div>;
}

export default VerifyOtp;
