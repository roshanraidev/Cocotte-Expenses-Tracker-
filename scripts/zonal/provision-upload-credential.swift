// Run locally. Generates a credential directly into Keychain, never argv/stdout/files.
import Foundation
import Security
import CryptoKit
let arguments = CommandLine.arguments
func fail() -> Never { fputs("Credential provisioning failed. Check Keychain access and use a new account name.\n", stderr); exit(1) }
guard arguments.count == 2, arguments[1].range(of: "^[A-Za-z0-9._-]{3,100}$", options: .regularExpression) != nil else { fail() }
var bytes = [UInt8](repeating: 0, count: 32)
guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { fail() }
let token = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
let entry: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.cocotte.zonal-upload", kSecAttrAccount as String: arguments[1], kSecValueData as String: Data(token.utf8)]
guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { fail() }
let hash = SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
print("Credential stored in macOS Keychain. Copy only this verification hash to AWS:")
print(hash)
