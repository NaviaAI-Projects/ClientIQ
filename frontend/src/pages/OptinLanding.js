import React, { useState, useEffect } from 'react';
import api from '../api';

const OptinLanding = () => {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const ucc = params.get('ucc');
    if (!token || !ucc) {
      setStatus('error');
      setMessage('Invalid opt-in link. Please contact your RM.');
      return;
    }
    api.post('/optin/confirm', { token, ucc })
      .then(res => { setStatus('success'); setMessage(res.data?.message || 'You have successfully opted in. Your RM will be in touch shortly.'); })
      .catch(err => { setStatus('error'); setMessage(err.response?.data?.message || 'This link has expired or is invalid. Please contact your RM.'); });
  }, []);

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#f5f4f0',fontFamily:'system-ui,sans-serif'}}>
      <div style={{background:'#fff',borderRadius:'14px',padding:'40px',maxWidth:'440px',width:'90%',textAlign:'center',boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>
        <h1 style={{fontSize:'20px',fontWeight:'700',color:'#185fa5',marginBottom:'8px'}}>Navia ClientIQ</h1>
        {status === 'loading' && <p style={{color:'#555'}}>Confirming your opt-in...</p>}
        {status === 'success' && (
          <>
            <div style={{fontSize:'48px',marginBottom:'16px'}}>✅</div>
            <h2 style={{fontSize:'18px',fontWeight:'600',marginBottom:'8px',color:'#3b6d11'}}>Opt-in confirmed!</h2>
            <p style={{color:'#555',lineHeight:'1.6'}}>{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{fontSize:'48px',marginBottom:'16px'}}>❌</div>
            <h2 style={{fontSize:'18px',fontWeight:'600',marginBottom:'8px',color:'#a32d2d'}}>Link invalid</h2>
            <p style={{color:'#555',lineHeight:'1.6'}}>{message}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OptinLanding;
