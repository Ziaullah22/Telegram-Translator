import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * ---------------------------------------------------------
 * LOGOUT CONTROLLER (src/components/Auth/Logout.tsx)
 * ---------------------------------------------------------
 * Handles the secure termination of the user session.
 * 
 * WORKFLOW:
 * 1. Clears AuthContext state (User, Token).
 * 2. Purges the Authorization header from axios.
 * 3. Redirects to the login route with immediate history replacement.
 */
export default function Logout() {

  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    logout();
    navigate('/login', { replace: true });
  }, []);

  return null;
}


