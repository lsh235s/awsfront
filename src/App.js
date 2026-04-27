import React, { useState } from 'react';

function App() {
  const [message, setMessage] = useState('대기 중...');
  const [error, setError] = useState(null);

  const callBackend = async () => {
    // [중요] 아래 주소를 본인이 만든 ALB의 DNS 주소로 반드시 변경하세요!
    // 예시: const albAddress = "http://my-alb-123456789.ap-northeast-2.elb.amazonaws.com";
    const albAddress = "http://localhost:8080"; 
    
    setMessage('호출 중...');
    setError(null);

    try {
      const response = await fetch(`${albAddress}/api/hello`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.text();
      setMessage(data);
    } catch (err) {
      setError(err.message);
      setMessage('호출 실패');
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Arial' }}>
      <h2>🚀 React Frontend -{">"} ALB -{">"} Private Backend 테스트</h2>
      <p>아래 버튼을 눌러 Private 서브넷에 있는 백엔드를 호출해 보세요.</p>
      
      <button 
        onClick={callBackend}
        style={{ padding: '10px 20px', fontSize: '16px', backgroundColor: '#ff9900', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
      >
        백엔드 API 호출하기
      </button>

      <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #ddd', display: 'inline-block', borderRadius: '8px', minWidth: '300px' }}>
        <h3 style={{ color: error ? 'red' : 'green' }}>
          {error ? '❌ 에러 발생' : '✅ 백엔드 응답'}
        </h3>
        <p style={{ fontWeight: 'bold', color: '#333' }}>{error ? error : message}</p>
      </div>
    </div>
  );
}

export default App;
