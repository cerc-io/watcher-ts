package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/muxer/mplex"
	"github.com/libp2p/go-libp2p/p2p/protocol/circuitv1/relay"
	webrtc "github.com/libp2p/go-libp2p/p2p/transport/webrtc"
)

func main() {
	host, err := createHost()
	if err != nil {
		panic(err)
	}
	defer host.Close()

	_, err = relay.NewRelay(host)
	if err != nil {
		log.Printf("Failed to instantiate the relay: %v", err)
		return
	}

	remoteInfo := peer.AddrInfo{
		ID:    host.ID(),
		Addrs: host.Network().ListenAddresses(),
	}

	remoteAddrs, _ := peer.AddrInfoToP2pAddrs(&remoteInfo)
	fmt.Println("p2p addr: ", remoteAddrs)

	fmt.Println("press Ctrl+C to quit")
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
	<-ch
}

func createHost() (host.Host, error) {
	// Create a host to act as a middleman to relay messages on our behalf
	// TODO: Add pubsub based peer discovery
	h, err := libp2p.New(
		libp2p.Transport(webrtc.New),
		libp2p.ListenAddrStrings(
			"/ip4/0.0.0.0/udp/0/webrtc",
		),
		libp2p.Muxer("/mplex/6.7.0", mplex.DefaultTransport),
		libp2p.EnableRelay(),
		// libp2p.DisableRelay(), https://github.com/libp2p/go-libp2p/blob/master/p2p/host/autorelay/autorelay_test.go#L97
		// libp2p.ForceReachabilityPublic(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create host: %v", err)
	}

	return h, nil
}
