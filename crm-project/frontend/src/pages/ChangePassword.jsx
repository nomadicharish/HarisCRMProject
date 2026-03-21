import { useState } from "react";
import axios from "axios";

function ChangePassword() {
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleChangePassword = async (e) => {
    e.preventDefault();

    const token = localStorage.getItem("token");

    try {
      await axios.post(
        "http://localhost:3000/api/auth/change-password",
        { newPassword },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setMessage("Password updated successfully!");
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.href = "/";
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Error updating password";

      console.error("Change password failed:", {
        message: errorMessage,
        status: error?.response?.status,
        data: error?.response?.data,
        fullError: error
      });

      setMessage(errorMessage);
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "100px auto" }}>
      <h2>Change Password</h2>

      <form onSubmit={handleChangePassword}>
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        <button type="submit" style={{ marginTop: "10px" }}>
          Update Password
        </button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}

export default ChangePassword;
