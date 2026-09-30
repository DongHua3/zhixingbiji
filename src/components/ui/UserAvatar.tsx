import React from 'react';
import Image from 'next/image';

interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  size?: number; // size in pixels
  fontSize?: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function UserAvatar({
  username,
  avatarUrl,
  size = 40,
  fontSize,
  style,
  className = ''
}: UserAvatarProps) {
  const finalUsername = username || '匿名';
  const avatarChar = finalUsername.charAt(0).toUpperCase();
  
  // Dynamically calculate font size if not specified
  const finalFontSize = fontSize || (size <= 24 ? '10px' : size <= 32 ? '13px' : '18px');

  return (
    <div 
      className={`avatar ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: finalFontSize,
        backgroundColor: 'var(--neo-blue)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        borderRadius: '50%',
        border: '2px solid var(--border-color, #000)',
        overflow: 'hidden',
        flexShrink: 0,
        ...style
      }}
    >
      {avatarUrl ? (
        <Image 
          src={avatarUrl} 
          alt={finalUsername} 
          width={size}
          height={size}
          unoptimized
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        avatarChar
      )}
    </div>
  );
}
