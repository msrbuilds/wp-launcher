<?php
/**
 * Encryption utility for storage credentials.
 *
 * Uses OpenSSL AES-256-CBC with AUTH_KEY as the encryption key.
 * Falls back to base64 encoding if OpenSSL is not available.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/util
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Encryption
 *
 * @since 1.0.0
 */
class FiveDPBR_Encryption {

	/**
	 * Cipher method.
	 *
	 * @var string
	 */
	const CIPHER = 'aes-256-cbc';

	/**
	 * Encrypt a value.
	 *
	 * @param string $value Plain text.
	 * @return string Encrypted string (base64-encoded).
	 */
	public static function encrypt( $value ) {
		if ( empty( $value ) ) {
			return '';
		}

		if ( ! self::can_encrypt() ) {
			// Fallback: base64 (not secure, but prevents plain-text storage).
			return 'b64:' . base64_encode( $value ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		}

		$key = self::get_key();
		$iv  = openssl_random_pseudo_bytes( openssl_cipher_iv_length( self::CIPHER ) );

		$encrypted = openssl_encrypt( $value, self::CIPHER, $key, 0, $iv );

		if ( false === $encrypted ) {
			return '';
		}

		// Store IV with the encrypted data.
		return 'enc:' . base64_encode( $iv . '::' . $encrypted ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
	}

	/**
	 * Decrypt a value.
	 *
	 * @param string $value Encrypted string.
	 * @return string Plain text.
	 */
	public static function decrypt( $value ) {
		if ( empty( $value ) ) {
			return '';
		}

		// Base64 fallback.
		if ( strpos( $value, 'b64:' ) === 0 ) {
			return base64_decode( substr( $value, 4 ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		}

		// Not encrypted.
		if ( strpos( $value, 'enc:' ) !== 0 ) {
			return $value;
		}

		if ( ! self::can_encrypt() ) {
			return ''; // Cannot decrypt without OpenSSL.
		}

		$data = base64_decode( substr( $value, 4 ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode

		if ( false === $data ) {
			return '';
		}

		$parts = explode( '::', $data, 2 );

		if ( count( $parts ) !== 2 ) {
			return '';
		}

		$iv        = $parts[0];
		$encrypted = $parts[1];
		$key       = self::get_key();

		$decrypted = openssl_decrypt( $encrypted, self::CIPHER, $key, 0, $iv );

		return false !== $decrypted ? $decrypted : '';
	}

	/**
	 * Check if OpenSSL encryption is available.
	 *
	 * @return bool
	 */
	public static function can_encrypt() {
		return extension_loaded( 'openssl' ) && in_array( self::CIPHER, openssl_get_cipher_methods(), true );
	}

	/**
	 * Get the encryption key derived from AUTH_KEY.
	 *
	 * @return string 32-byte key.
	 */
	private static function get_key() {
		$salt = defined( 'AUTH_KEY' ) ? AUTH_KEY : 'fdpbr-default-key-please-change';
		return hash( 'sha256', $salt, true );
	}
}
