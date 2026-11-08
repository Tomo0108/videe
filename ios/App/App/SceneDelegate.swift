import UIKit
import Capacitor
import UniformTypeIdentifiers

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = VideeBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // Cold launch from Files / "Open in Videe": the player picks these up once it is ready.
        VideeOpenPlugin.receive(connectionOptions.urlContexts.map { $0.url })
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        VideeOpenPlugin.receive(URLContexts.map { $0.url })
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Registers the app's own plugins with the Capacitor bridge.
class VideeBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VideeOpenPlugin())
    }
}

/// Hands video files opened from other apps to the web player.
/// Files are copied into the app's temporary folder so the player can read them
/// after the security-scoped access to the original ends.
@objc(VideeOpenPlugin)
public class VideeOpenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VideeOpenPlugin"
    public let jsName = "VideeOpen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise)
    ]

    private static var pending: [[String: Any]] = []
    private static weak var shared: VideeOpenPlugin?
    private static let inbox = FileManager.default.temporaryDirectory.appendingPathComponent("Opened", isDirectory: true)

    override public func load() {
        VideeOpenPlugin.shared = self
    }

    @objc func takePending(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let files = VideeOpenPlugin.pending
            VideeOpenPlugin.pending = []
            call.resolve(["files": files])
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        if let path = call.getString("path") {
            let folder = URL(fileURLWithPath: path).deletingLastPathComponent().standardizedFileURL
            if folder.deletingLastPathComponent().path == VideeOpenPlugin.inbox.standardizedFileURL.path {
                try? FileManager.default.removeItem(at: folder)
            }
        }
        call.resolve()
    }

    static func receive(_ urls: [URL]) {
        let fileURLs = urls.filter { $0.isFileURL }
        guard !fileURLs.isEmpty else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            let files = fileURLs.compactMap { copyIn($0) }
            DispatchQueue.main.async {
                guard !files.isEmpty else { return }
                pending.append(contentsOf: files)
                shared?.notifyListeners("filesOpened", data: [:])
            }
        }
    }

    private static func copyIn(_ url: URL) -> [String: Any]? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let folder = inbox.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let target = folder.appendingPathComponent(url.lastPathComponent)
        var copied = false
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readable in
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try FileManager.default.copyItem(at: readable, to: target)
                copied = true
            } catch {
                copied = false
            }
        }
        guard copied else {
            try? FileManager.default.removeItem(at: folder)
            return nil
        }
        // Files handed over as a copy land in Documents/Inbox; drop that duplicate.
        if url.path.contains("/Documents/Inbox/") { try? FileManager.default.removeItem(at: url) }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? ""
        return ["url": target.absoluteString, "path": target.path, "name": url.lastPathComponent, "type": type]
    }
}
